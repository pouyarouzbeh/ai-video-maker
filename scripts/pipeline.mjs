import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  assets, blenderBin, brief, cache, fingerprint, json, locateFfmpeg, output, project, root, run, timeline,
} from "./project.mjs";
import { withMcp } from "./mcp-client.mjs";
import { soundtrack } from "./soundtrack.mjs";

const action = process.argv[2];
const tools = await locateFfmpeg();
const cli = join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");
const ff = (args) => run(tools.ffmpeg, ["-hide_banner", "-nostdin", ...args], { env: tools.env });
const browser = process.env.REEL_CHROME || (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "");
const browserFlag = browser ? ["--browser-executable=" + browser, "--chrome-mode=chrome-for-testing"] : [];
const composition = "PortfolioReel";
const manifestPath = join(project, "assets.json");
const propsPath = join(cache, "props.json");

await Promise.all([mkdir(assets, { recursive: true }), mkdir(cache, { recursive: true }), mkdir(output, { recursive: true })]);

function parsedOutput(command, args) {
  return JSON.parse(run(command, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env: tools.env }));
}

function loudness(path) {
  const result = spawnSync(tools.ffmpeg, [
    "-hide_banner", "-nostdin", "-i", path, "-vn",
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=8:print_format=json", "-f", "null", "-",
  ], { encoding: "utf8", env: tools.env });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  const start = result.stderr.lastIndexOf("{");
  const end = result.stderr.lastIndexOf("}");
  return JSON.parse(result.stderr.slice(start, end + 1));
}

async function renderPhone(files, smoke = false) {
  const screen = join(assets, files.home.path);
  const script = join(root, "scripts", "phone.py");
  const engine = process.env.REEL_BLENDER_ENGINE || "BLENDER_EEVEE";
  const signature = fingerprint(readFileSync(screen), readFileSync(script), engine, "sampled-540-v2");
  const dir = join(cache, smoke ? "phone-smoke" : "phone-" + signature.slice(0, 12));
  await mkdir(dir, { recursive: true });
  const jobPath = join(dir, "job.json");
  const video = join(assets, "phone.mp4");
  const poster = join(assets, "phone-poster.jpg");
  const blend = join(output, "phone.blend");
  const marker = join(cache, "phone.key");
  const width = smoke ? 360 : 540;
  const height = smoke ? 640 : 960;
  const frameStep = smoke ? 1 : 5;
  const lastFrame = smoke ? 3 : 76;
  if (smoke && [marker, video].every(existsSync) && readFileSync(marker, "utf8") === signature) {
    const sample = join(dir, "phone-sample.mp4");
    ff(["-loglevel", "error", "-y", "-i", video, "-frames:v", "3",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", sample]);
    return sample;
  }
  if (!smoke && [marker, video, poster, blend].every(existsSync) && readFileSync(marker, "utf8") === signature) {
    console.log("Reusing the Blender phone shot");
    return video;
  }
  const lastPng = join(dir, String(lastFrame).padStart(4, "0") + ".png");
  if (!existsSync(lastPng) || (!smoke && !existsSync(blend))) {
    console.log("Rendering Blender phone: " + width + "×" + height + " (" + (1 + (lastFrame - 1) / frameStep) + " sampled frames)");
    await writeFile(jobPath, JSON.stringify({
      screen, frames: dir + sep, width, height, lastFrame, frameStep, samples: 2,
      blend: smoke ? null : blend, engine,
    }));
    const env = { ...process.env, REEL_BLENDER_JOB: jobPath };
    if (process.env.REEL_BLENDER_DIRECT === "1") {
      run(blenderBin(), ["-b", "--factory-startup", "--python-exit-code", "1", "--python", script], { env });
    } else {
      await withMcp("blender", async ({ call, tools: listed }) => {
        const tool = listed.find(({name}) => name.endsWith("python_exec"));
        const result = await call(tool.name, { script_path: script, transport: "headless", timeout_seconds: 1800 }, 1810000);
        console.log(JSON.stringify(result).slice(-700));
      }, env);
    }
  }
  if (!existsSync(lastPng)) throw new Error("Blender returned without writing " + lastPng);
  const tempVideo = join(dir, "phone-encoded.mp4");
  if (!smoke) {
    for (let index = 1; index <= lastFrame; index += frameStep) {
      const number = String(index).padStart(4, "0");
      await copyFile(join(dir, number + ".png"), join(dir, "plate-" + (index - 1) / frameStep + ".png"));
    }
  }
  ff(["-loglevel", "error", "-y", "-framerate", String(30 / frameStep), "-i", join(dir, smoke ? "%04d.png" : "plate-%d.png"),
    ...(smoke ? [] : ["-vf", "tpad=stop_mode=clone:stop=2,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,tpad=stop_mode=clone:stop=90", "-frames:v", "150"]),
    "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tempVideo]);
  if (smoke) return tempVideo;
  await copyFile(tempVideo, video);
  ff(["-loglevel", "error", "-y", "-i", lastPng, "-frames:v", "1", "-q:v", "2", "-update", "1", poster]);
  await writeFile(marker, signature);
  return video;
}

async function prepareAudio() {
  const signature = fingerprint(JSON.stringify(timeline), readFileSync(join(root, "scripts", "soundtrack.mjs")));
  const target = join(assets, "mix.wav");
  const marker = join(cache, "audio.key");
  if (existsSync(target) && existsSync(marker) && readFileSync(marker, "utf8") === signature) return;
  const raw = join(cache, "score-raw.wav");
  soundtrack(raw);
  const measured = loudness(raw);
  const stats = ["I=-14", "TP=-1.5", "LRA=8", "linear=true", "measured_I=" + measured.input_i,
    "measured_TP=" + measured.input_tp, "measured_LRA=" + measured.input_lra,
    "measured_thresh=" + measured.input_thresh, "offset=" + measured.target_offset];
  const temporary = join(cache, "mix.wav");
  ff(["-loglevel", "error", "-y", "-i", raw, "-af", "loudnorm=" + stats.join(":"), "-ar", "48000", temporary]);
  await copyFile(temporary, target);
  await writeFile(marker, signature);
}

function validateTimeline() {
  const ids = ["hook", "phone", "catalog", "interaction", "details", "end"];
  if (timeline.fps !== 30 || timeline.shots.length !== ids.length) throw new Error("The reel uses six shots at 30 fps");
  let expected = 0;
  for (const [i, shot] of timeline.shots.entries()) {
    if (shot.id !== ids[i] || shot.from !== expected || !Number.isInteger(shot.to) || shot.to <= shot.from) {
      throw new Error("Invalid or non-contiguous shot at " + i);
    }
    expected = shot.to;
  }
  if (expected !== timeline.duration) throw new Error("Timeline duration does not match its last shot");
  if (!timeline.cues.every(({frame}) => Number.isInteger(frame) && frame >= 0 && frame < expected)) {
    throw new Error("A sound cue is outside the timeline");
  }
}

async function prepare({ smoke = false } = {}) {
  validateTimeline();
  if (!existsSync(manifestPath) || !Object.values(json(manifestPath).files).every(({path}) => existsSync(join(assets, path)))) {
    run(process.execPath, [join(root, "scripts", "capture.mjs")]);
  }
  const { files } = json(manifestPath);
  const phone = await renderPhone(files, smoke);
  await prepareAudio();
  if (smoke) await copyFile(phone, join(assets, "phone-smoke.mp4"));
  const props = { brief, timeline, files: { ...files, ...(smoke ? { phone: { path: "phone-smoke.mp4" } } : {}) } };
  await writeFile(propsPath, JSON.stringify(props));
}

function remotion(args) {
  run(process.execPath, [cli, ...args, ...browserFlag, "--timeout=90000"], { env: tools.env });
}

async function renderVideo(mode) {
  const smoke = mode === "smoke";
  const preview = mode === "preview";
  await prepare({ smoke });
  const filename = smoke ? "smoke.mp4" : preview ? "animatic.mp4" : brief.slug + "-reel.mp4";
  const target = join(mode === "render" ? output : cache, filename);
  const stage = join(cache, mode + "-remotion.mp4");
  remotion(["render", "src/index.tsx", composition, stage, "--props=" + propsPath, "--codec=h264",
    "--pixel-format=yuv420p", "--color-space=bt709", "--concurrency=3", "--crf=" + (preview ? 22 : 16), "--log=warn",
    ...(smoke ? ["--frames=90-92", "--scale=0.5"] : preview ? ["--scale=0.5"] : []),
  ]);
  const delivery = join(cache, mode + "-delivery.mp4");
  const { streams: [rendered] } = parsedOutput(tools.ffprobe, [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "json", stage,
  ]);
  const video = rendered.pix_fmt === "yuv420p" ? ["-c:v", "copy"] : [
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-color_range", "tv", "-colorspace", "bt709",
    "-color_trc", "bt709", "-color_primaries", "bt709",
  ];
  const audioInput = smoke ? [] : ["-i", join(assets, "mix.wav")];
  const audio = smoke ? ["-map", "0:a:0?", "-c:a", "copy"] : [
    "-map", "1:a:0", "-c:a", "aac", "-b:a", "256k", "-t", String(timeline.duration / timeline.fps),
  ];
  ff(["-loglevel", "error", "-y", "-i", stage, ...audioInput, "-map", "0:v:0", ...video, ...audio,
    "-movflags", "+faststart", delivery]);
  await verify(delivery, smoke ? 3 : timeline.duration, mode === "render" ? 1080 : 540, !smoke);
  await rename(delivery, target);
  if (mode === "render") {
    remotion(["still", "src/index.tsx", "PortfolioCover", join(cache, "cover.png"), "--props=" + propsPath, "--log=warn"]);
    ff(["-loglevel", "error", "-y", "-i", join(cache, "cover.png"), "-frames:v", "1", "-q:v", "2", "-update", "1", join(output, "cover.jpg")]);
    await copyFile(join(project, "caption.txt"), join(output, "caption.txt"));
  }
  console.log("Verified " + target);
}

async function verify(path, frames, width, checkAudio) {
  const probe = parsedOutput(tools.ffprobe, [
    "-v", "error", "-count_frames", "-show_streams", "-of", "json", path,
  ]);
  const video = probe.streams.find(({codec_type}) => codec_type === "video");
  const audio = probe.streams.find(({codec_type}) => codec_type === "audio");
  if (video?.codec_name !== "h264" || video.pix_fmt !== "yuv420p" ||
      video.width !== width || video.height !== width * 16 / 9 ||
      Number(video.nb_read_frames) !== frames || video.avg_frame_rate !== "30/1") {
    throw new Error("Unexpected video stream: " + JSON.stringify(video));
  }
  const bytes = readFileSync(path);
  let moov = -1;
  let mdat = -1;
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "moov") moov = offset;
    if (type === "mdat") mdat = offset;
    if (size < 8) break;
    offset += size;
  }
  if (moov < 0 || mdat < 0 || moov >= mdat) throw new Error("The MP4 is not faststart");
  const report = { width, height: video.height, frames, fps: video.avg_frame_rate,
    video: video.codec_name, audio: audio?.codec_name, pixelFormat: video.pix_fmt, faststart: true };
  if (checkAudio) {
    if (audio?.codec_name !== "aac" || audio.sample_rate !== "48000" || audio.channels !== 2) {
      throw new Error("Expected stereo 48 kHz AAC");
    }
    const measure = loudness(path);
    report.lufs = Number(measure.input_i);
    report.truePeak = Number(measure.input_tp);
    if (!Number.isFinite(report.lufs) || Math.abs(report.lufs + 14) > 1 || report.truePeak > -1) {
      throw new Error("Unexpected mix loudness: " + JSON.stringify(report));
    }
  }
  ff(["-loglevel", "error", "-xerror", "-i", path, "-f", "null", "-"]);
  await writeFile(join(cache, action + "-verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}

if (action === "doctor") {
  console.log("Node " + process.version);
  run(blenderBin(), ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
    .split(/\r?\n/).slice(0, 1).forEach((line) => console.log(line));
  for (const executable of [tools.ffmpeg, tools.ffprobe]) {
    console.log(executable);
    console.log(run(executable, ["-version"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).split(/\r?\n/)[0]);
  }
  run(process.execPath, [cli, "versions"]);
  await prepareAudio();
  await withMcp("blender", async ({ name, call, tools: listed }) => {
    const tool = listed.find((entry) => entry.name.endsWith("python_exec"));
    const result = await call(tool.name, { code: "import bpy\n__result__ = {'version': bpy.app.version_string}", transport: "headless" }, 60000);
    console.log(name + ": " + JSON.stringify(result).slice(-400));
  });
  await withMcp("ffmpeg", async ({ name, call, tools: listed }) => {
    const tool = listed.find((entry) => entry.name.endsWith("probe"));
    const result = await call(tool.name, { inputs: [join(assets, "mix.wav")] });
    console.log(name + ": " + JSON.stringify(result).slice(0, 350));
  });
} else if (action === "verify") {
  const path = process.argv[3] ? resolve(process.argv[3]) : join(output, brief.slug + "-reel.mp4");
  await verify(path, timeline.duration, 1080, true);
} else if (action === "studio") {
  await prepare();
  remotion(["studio", "src/index.tsx", "--props=" + propsPath]);
} else if (["smoke", "preview", "render", "phone"].includes(action)) {
  const lock = join(cache, "render.lock");
  const lease = await open(lock, "wx").catch((error) => {
    if (error.code === "EEXIST") throw new Error("Another reel render is active. See " + lock);
    throw error;
  });
  try {
    await lease.writeFile(String(process.pid));
    if (action === "phone") {
      const files = existsSync(manifestPath) ? json(manifestPath).files : { home: { path: "home.png" } };
      await renderPhone(files);
    }
    else await renderVideo(action);
  } finally {
    await lease.close();
    await unlink(lock);
  }
} else {
  throw new Error("Usage: node scripts/pipeline.mjs doctor|smoke|preview|render|studio|verify");
}
