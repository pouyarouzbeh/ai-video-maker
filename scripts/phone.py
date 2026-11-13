"""Build and render the Peony phone shot with Blender's bundled Python."""
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


job = json.loads(Path(os.environ["REEL_BLENDER_JOB"]).read_text(encoding="utf-8"))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def color(hex_value):
    srgb = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb)


def material(name, hex_value, metallic=0, roughness=0.38):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color(hex_value), 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def slab(name, dimensions, location, bevel, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    edge = obj.modifiers.new("Machined edges", "BEVEL")
    edge.width = bevel
    edge.segments = 5
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def rounded_panel(name, width, height, radius, depth, mat, parent):
    vertices = []
    for cx, cy, angle in (
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, 90),
        (-width / 2 + radius, -height / 2 + radius, 180),
        (width / 2 - radius, -height / 2 + radius, 270),
    ):
        for segment in range(13):
            a = math.radians(angle + segment * 90 / 12)
            vertices.append((cx + radius * math.cos(a), cy + radius * math.sin(a), depth))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [list(range(len(vertices)))])
    mesh.update()
    uv = mesh.uv_layers.new()
    for loop in mesh.loops:
        x, y, _ = vertices[loop.vertex_index]
        uv.data[loop.index].uv = (x / width + 0.5, y / height + 0.5)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj


def area(name, position, aim, energy, tint, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color(tint)
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(aim) - obj.location).to_track_quat("-Z", "Y").to_euler()


frame = material("Brushed plum titanium", "78677a", 0.58, 0.27)
glass = material("Obsidian bezel", "19171d", 0.22, 0.23)
floor = material("Mulberry cyclorama", "332433", 0.05, 0.67)
phone = bpy.data.objects.new("Phone rig", None)
scene.collection.objects.link(phone)
slab("Body", (2.70, 5.55, 0.28), (0, 0, 0), 0.124, frame, phone)
rounded_panel("Cover glass", 2.59, 5.44, 0.20, 0.149, glass, phone)
slab("Volume control", (0.075, 0.67, 0.106), (-1.36, 0.65, 0), 0.034, frame, phone)
slab("Power control", (0.072, 0.53, 0.10), (1.36, 0.49, 0), 0.032, frame, phone)

display = bpy.data.materials.new("Actual storefront capture")
display.use_nodes = True
nodes = display.node_tree.nodes
nodes.clear()
image = nodes.new("ShaderNodeTexImage")
image.image = bpy.data.images.load(job["screen"], check_existing=True)
image.image.pack()
emission = nodes.new("ShaderNodeEmission")
emission.inputs["Strength"].default_value = 0.98
output = nodes.new("ShaderNodeOutputMaterial")
display.node_tree.links.new(image.outputs["Color"], emission.inputs["Color"])
display.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
rounded_panel("Peony display", 2.45, 5.145, 0.143, 0.155, display, phone)

slab("Backdrop", (200, 200, 0.3), (0, 0, -1.45), 0, floor)
area("Large softbox", (-4, 4.7, 6), (0, 0.9, -1.3), 670, "ffe1ee", 5.4)
area("Lavender edge", (4.3, -1.0, 3), (0, 0, 0), 280, "dac1ff", 4.0)
area("Fill", (0, -6, 5), (0, 0, -1), 165, "ffedde", 6)
scene.world = bpy.data.worlds.new("Studio ambience")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (*color("b8a2bd"), 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.25

camera_data = bpy.data.cameras.new("Portrait product camera")
camera = bpy.data.objects.new("Portrait product camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 43


def pose(index):
    t = min(max((index - 1) / 76, 0), 1)
    eased = t * t * (3 - 2 * t)
    orbit = (1 - eased) * 0.40
    camera.location = (math.sin(orbit) * 11.0, 0.8 * (1 - eased) - 0.7, 10.0 + 1.0 * eased)
    target = Vector((0.30 - 0.23 * eased, -0.59, 0))
    forward = (target - camera.location).normalized()
    right = forward.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(forward)
    camera.rotation_euler = Matrix((right, up, -forward)).transposed().to_euler()
    phone.location = (-0.05 - 0.18 * eased, 0.45, 0)
    phone.rotation_euler = (0.11 * (1 - eased), -0.13 * (1 - eased), -0.18 * (1 - eased))
    for obj in (phone, camera):
        obj.keyframe_insert("location", frame=index)
        obj.keyframe_insert("rotation_euler", frame=index)


for index in range(1, 78):
    pose(index)

scene.render.engine = job.get("engine", "BLENDER_EEVEE")
if scene.render.engine == "CYCLES":
    scene.cycles.samples = job.get("samples", 4)
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 1
else:
    scene.eevee.taa_render_samples = 8
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = job["width"]
scene.render.resolution_y = job["height"]
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.render.use_persistent_data = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.compression = 12
scene.render.filepath = job["frames"]
scene.frame_start = 1
scene.frame_end = 150
scene.frame_set(1)
if job.get("blend"):
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=job["blend"])
scene.frame_end = job["lastFrame"]
scene.frame_step = job.get("frameStep", 1)
bpy.ops.render.render(animation=True)
__result__ = {"frames": scene.frame_end, "engine": scene.render.engine}
