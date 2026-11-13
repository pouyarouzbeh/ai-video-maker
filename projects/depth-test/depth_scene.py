"""Rebuild the depth-test studio scene from Blender's background Python runtime.

Run from the workspace root:
    blender -b --factory-startup --python-exit-code 1 -t 6 --python projects/depth-test/depth_scene.py
FFmpeg must be on PATH or in the directory named by REEL_FFMPEG_BIN.
Append `-- --still-only` to render just the two camera plates.
"""

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT = Path(__file__).resolve().parent
ROOT = PROJECT.parents[1]
PLATES = ROOT / "public" / "depth-test" / "plates"


def linear_color(hex_rgb):
    channels = [int(hex_rgb[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4
                 for value in channels)


def surface(name, hex_rgb, roughness, metallic=0.0, textured=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*linear_color(hex_rgb), 1)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = material.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if textured:
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        grain = nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 225
        grain.inputs["Detail"].default_value = 2
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.18
        bump.inputs["Distance"].default_value = 0.012
        links.new(grain.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def slab(name, position, fixed_size, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = fixed_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Machined edge", "BEVEL")
    bevel.width = 0.07
    bevel.segments = 5
    normal = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def build_backdrop(material):
    # One continuous sweep avoids a horizon break between the two viewing angles.
    z_floor = -1.31
    curve_radius = 2.5
    section = [(-60, z_floor)]
    for index in range(13):
        angle = index * math.pi / 24
        section.append((5.0 + math.sin(angle) * curve_radius,
                        z_floor + (1 - math.cos(angle)) * curve_radius))
    section.append((7.5, 18))
    vertices = [(x, y, z) for y, z in section for x in (-25, 25)]
    faces = [(i, i + 1, i + 3, i + 2) for i in range(0, len(vertices) - 2, 2)]
    mesh = bpy.data.meshes.new("Cyclorama mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    backdrop = bpy.data.objects.new("Navy cyclorama", mesh)
    bpy.context.collection.objects.link(backdrop)
    backdrop.data.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def light(name, position, target, power, size, hex_rgb):
    bpy.ops.object.light_add(type="AREA", location=position)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = power
    obj.data.size = size
    obj.data.color = linear_color(hex_rgb)
    aim(obj, target)


def camera_at(frame, angle, height):
    camera.location = (math.sin(angle) * 9, -math.cos(angle) * 9, height)
    aim(camera, (0, -0.12, -0.03))
    for property_name in ("location", "rotation_euler"):
        camera.keyframe_insert(data_path=property_name, frame=frame)


def encode_motion(frames, frame_step, start, end):
    ffmpeg_dir = os.environ.get("REEL_FFMPEG_BIN")
    ffmpeg_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    ffmpeg = str(Path(ffmpeg_dir) / ffmpeg_name) if ffmpeg_dir else ffmpeg_name
    for index, frame in enumerate(range(start, end + 1, frame_step)):
        shutil.copyfile(frames / f"turn-{frame:04}.png", frames / f"plate-{index:02}.png")
    encoded = frames / "turn.mp4"
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-framerate", "10",
        "-i", str(frames / "plate-%02d.png"), "-vf",
        "tpad=stop_mode=clone:stop=2,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir",
        "-frames:v", "60", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(encoded),
    ], check=True)
    shutil.copyfile(encoded, PLATES / "turn.mp4")


bpy.ops.wm.read_factory_settings(use_empty=True)
PLATES.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
build_backdrop(surface("Midnight blue cyclorama", "1a2535", 0.85))
near = slab("Near teal plate", (-0.56, -0.91, 0.02), (2.92, 0.22, 2.44),
            surface("Brushed teal", "44d6b6", 0.37, 0.24, True))
far = slab("Far amber plate", (0.57, 0.77, -0.10), (2.92, 0.22, 2.31),
           surface("Brushed amber", "ffb45e", 0.4, 0.21, True))
near["Example depth"] = 0.25
far["Example depth"] = 0.75
scene["Instructional model"] = "Depth labels are normalized sample depths, not world-space distances."
light("Large warm key", (-3.8, -4.2, 5.2), (0, 0, -0.3), 825, 4.5, "fff0dd")
light("Sky fill", (4.1, -2.2, 3.4), (0, 0.3, 0), 390, 5.4, "cadcff")
light("Back edge", (1.2, 3.1, 4.6), (0.2, 0.35, 0.1), 790, 3.0, "cae3ff")

scene.world = bpy.data.worlds.new("Subtle studio ambience")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (*linear_color("777e8e"), 1)
background.inputs["Strength"].default_value = 0.28

bpy.ops.object.camera_add()
camera = bpy.context.object
camera.name = "Front to oblique study camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 5.9
scene.camera = camera

scene.frame_start = 1
scene.frame_end = 61
scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 8
scene.render.resolution_x = 1080
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.use_persistent_data = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.compression = 19
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

for frame in range(scene.frame_start, scene.frame_end + 1):
    progress = (frame - scene.frame_start) / (scene.frame_end - scene.frame_start)
    ease = progress * progress * (3 - 2 * progress)
    camera_at(frame, 0.65 * ease, 0.30 + 2.95 * ease)

scene.frame_set(scene.frame_start)
bpy.context.preferences.filepaths.save_version = 0
scene.render.filepath = str(PLATES / "front.png")
bpy.ops.wm.save_as_mainfile(filepath=str(PROJECT / "depth_scene.blend"))
for name, frame in (("front", scene.frame_start), ("oblique", scene.frame_end)):
    scene.frame_set(frame)
    scene.render.filepath = str(PLATES / f"{name}.png")
    bpy.ops.render.render(write_still=True)

if "--still-only" not in sys.argv:
    # Keep the motion plates in cache. The production pipeline consumes the encoded clip.
    frames = ROOT / ".cache" / "depth-test" / "depth-turn"
    frames.mkdir(parents=True, exist_ok=True)
    scene.frame_step = 3
    scene.render.resolution_percentage = 60
    scene.eevee.taa_render_samples = 3
    scene.render.filepath = str(frames / "turn-")
    bpy.ops.render.render(animation=True)
    encode_motion(frames, scene.frame_step, scene.frame_start, scene.frame_end)
