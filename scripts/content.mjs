import {spawnSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {copyFile, mkdir, mkdtemp, open, rename, rm, unlink, writeFile} from "node:fs/promises";
import {basename, join} from "node:path";

const supportedFormats = ["reel", "image", "carousel", "story"];
const idPattern = /^[a-z\d][a-z\d-]*$/i;
const action = process.argv[2];
if (!["preview", "render", "verify", "studio", "cover"].includes(action)) {
  throw new Error("Usage: content.mjs preview|render|verify|studio|cover (select with REEL_PROJECT)");
}
if (!process.env.REEL_PROJECT) throw new Error("Set REEL_PROJECT to the folder name under projects.");
const {assets, brief, cache, json, locateFfmpeg, output, project, root, run, slug, timeline} = await import("./project.mjs");
if (!brief.format) {
  if (action === "cover") throw new Error("Use the portfolio renderer for legacy covers");
  await import("./pipeline.mjs");
} else {
  await contentCommand();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkRange(start, end, length, label) {
  assert(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= length,
    label + " must be a non-empty, in-bounds frame range");
}

function checkTimedList(list, length, label) {
  let previousEnd = 0;
  for (const {from, to = length} of list ?? []) {
    checkRange(from, to, length, label);
    assert(from >= previousEnd, label + " must be sorted and non-overlapping");
    previousEnd = to;
  }
}

function loadContent() {
  assert(supportedFormats.includes(brief.format), "Unsupported brief.format: " + brief.format);
  assert(brief.slug === undefined || brief.slug === slug, "brief.slug must match the project directory");
  assert(typeof brief.title === "string" && brief.title.trim(), "brief.title is required");
  const storyboard = join(project, "storyboard.json");
  const manifest = join(project, "assets.json");
  const items = existsSync(storyboard) ? json(storyboard).items : brief.items;
  const files = existsSync(manifest) ? json(manifest).files : {};
  assert(Array.isArray(items) && items.length, "Add ordered items to storyboard.json or brief.items");
  assert(files && typeof files === "object" && !Array.isArray(files), "assets.json needs a files object");
  const itemMap = new Map();
  for (const item of items) {
    assert(idPattern.test(item.id ?? "") && !itemMap.has(item.id), "Invalid or duplicate item ID: " + item.id);
    assert(["image", "video", "text"].includes(item.kind), "Unsupported item kind: " + item.id);
    assert(Array.isArray(item.assetIds), "Missing assetIds for " + item.id);
    if (item.kind !== "text") assert(files[item.assetIds[0]]?.kind === item.kind, "Missing " + item.kind + " asset for " + item.id);
    if (item.trimBefore !== undefined) assert(Number.isInteger(item.trimBefore) && item.trimBefore >= 0, "Invalid trimBefore: " + item.id);
    itemMap.set(item.id, item);
  }
  const moving = brief.format === "reel" || (brief.format === "story" &&
    (timeline !== null || items.some((item) => item.kind === "video")));
  if (brief.format === "image") assert(items.length === 1, "An image project has exactly one item");
  if (!moving) assert(items.every((item) => item.kind !== "video"), "Still formats accept images and text");
  const fps = moving ? timeline?.fps : 30;
  assert(Number.isInteger(fps) && fps >= 1, "A moving project needs timeline.json with a positive integer fps");
  const shots = moving ? timeline.shots : items.map(({id}, index) => ({id, from: index, to: index + 1}));
  assert(Array.isArray(shots) && shots.length === items.length, "Timeline must time every storyboard item");
  let frame = 0;
  const ids = new Set();
  for (const shot of shots) {
    const item = itemMap.get(shot.id);
    assert(item && !ids.has(shot.id), "Unknown or repeated shot ID: " + shot.id);
    assert(shot.from === frame && Number.isInteger(shot.to) && shot.to > shot.from, "Non-contiguous shot: " + shot.id);
    const length = shot.to - shot.from;
    checkTimedList(item.captionCues, length, shot.id + " captions");
    checkTimedList(item.overlays, length, shot.id + " overlays");
    if (item.titleMotion) {
      const {enterFrames, exitFrames = 0} = item.titleMotion;
      assert([enterFrames, exitFrames].every((value) => Number.isInteger(value) && value >= 0) &&
        enterFrames + exitFrames < length, "Title motion needs a readable hold: " + shot.id);
    }
    ids.add(shot.id);
    frame = shot.to;
  }
  if (moving) assert(timeline.duration === frame, "Timeline duration must equal the final frame boundary");
  const audio = moving ? timeline.audio : undefined;
  if (audio) assert(files[audio.assetId]?.kind === "audio", "Timeline audio must reference an audio asset");
  const usedAssets = new Set(items.flatMap((item) => item.assetIds));
  if (audio) usedAssets.add(audio.assetId);
  for (const id of usedAssets) {
    const asset = Object.hasOwn(files, id) ? files[id] : null;
    assert(asset && ["image", "video", "audio"].includes(asset.kind), "Unknown asset: " + id);
    assert(typeof asset.path === "string" && asset.path.split("/").every((part) =>
      part && part !== "." && part !== ".." && !/[\\:]/.test(part)), "Use a project-relative public path for " + id);
    assert(existsSync(join(assets, asset.path)), "Missing local asset for " + id + ": " + asset.path);
  }
  return {moving, props: {brief: {...brief, slug, language: brief.language ?? "fa"},
    files, items, timeline: {fps, duration: frame, shots, audio}}};
}

function faststart(path) {
  const bytes = readFileSync(path);
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "mdat") return false;
    if (type === "moov") return true;
    if (size < 8) return false;
    offset += size;
  }
  return false;
}

async function contentCommand() {
  const {moving, props} = loadContent();
  const tools = await locateFfmpeg();
  const exec = (command, args) => run(command, args, {env: tools.env});
  const capture = (command, args) => run(command, args,
    {env: tools.env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"]});
  const ff = (...args) => exec(tools.ffmpeg, ["-hide_banner", "-nostdin", "-loglevel", "error", ...args]);
  const browser = process.env.REEL_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browserFlags = existsSync(browser) ? ["--browser-executable=" + browser, "--chrome-mode=chrome-for-testing"] : [];
  const entry = "src/content-root.tsx";
  const remotion = (...args) => exec(process.execPath, [
    join(root, "node_modules", "@remotion", "cli", "remotion-cli.js"), ...args, ...browserFlags, "--timeout=90000",
  ]);
  const feed = ["image", "carousel"].includes(brief.format);
  const height = feed ? 1350 : 1920;
  const stem = slug + "-" + brief.format;
  const names = moving ? [stem + ".mp4"] : props.items.map((_, index) => String(index + 1).padStart(2, "0") + ".png");
  const hasAudio = Boolean(props.timeline.audio) || props.items.some((item) => item.kind === "video" && item.sourceVolume > 0);

  function probe(path) {
    return JSON.parse(capture(tools.ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-of", "json", path])).streams;
  }

  function checkMedia(path, scale) {
    const streams = probe(path);
    const video = streams.find((stream) => stream.codec_type === "video");
    assert(video?.width === 1080 * scale && video.height === height * scale, "Wrong output dimensions: " + path);
    const report = {name: path, width: video.width, height: video.height, frames: Number(video.nb_read_frames)};
    if (moving) {
      assert(video.codec_name === "h264" && video.pix_fmt === "yuv420p" &&
        report.frames === props.timeline.duration && video.avg_frame_rate === props.timeline.fps + "/1" &&
        video.color_space === "bt709" && faststart(path), "Invalid H.264 delivery: " + path);
      const audio = streams.find((stream) => stream.codec_type === "audio");
      if (hasAudio) assert(audio?.codec_name === "aac" && audio.sample_rate === "48000" && audio.channels === 2,
        "Expected 48 kHz stereo AAC: " + path);
      Object.assign(report, {fps: video.avg_frame_rate, faststart: true, audio: audio?.codec_name});
      if (audio && brief.audioTarget) {
        const {stderr, status, error} = spawnSync(tools.ffmpeg, ["-hide_banner", "-nostdin", "-i", path,
          "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"], {env: tools.env, encoding: "utf8"});
        if (error || status !== 0) throw error ?? new Error(stderr);
        const measurement = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
        report.lufs = Number(measurement.input_i);
        report.truePeak = Number(measurement.input_tp);
        assert(Number.isFinite(report.lufs) && Math.abs(report.lufs - brief.audioTarget.lufs) <= 1 &&
          report.truePeak <= brief.audioTarget.maxTruePeak, "Delivery audio outside the brief target: " + JSON.stringify(report));
      }
    } else assert(video.codec_name === "png" && report.frames === 1, "Expected a single PNG: " + path);
    ff("-xerror", "-i", path, "-f", "null", "-");
    return report;
  }

  function verify(directory, scale) {
    return names.map((name) => checkMedia(join(directory, name), scale));
  }

  await mkdir(cache, {recursive: true});
  if (action === "verify") {
    console.log(JSON.stringify(verify(output, 1), null, 2));
    return;
  }
  if (action === "studio") {
    const propsFile = join(cache, "studio-props.json");
    await writeFile(propsFile, JSON.stringify(props));
    remotion("studio", entry, "--props=" + propsFile, ...process.argv.slice(3));
    return;
  }

  const lock = join(root, ".cache", "content-render.lock");
  const lockFile = await open(lock, "wx").catch((error) => {
    if (error.code === "EEXIST") throw new Error("Another content render is active: " + lock);
    throw error;
  });
  let stage;
  try {
    await lockFile.writeFile(String(process.pid));
    stage = await mkdtemp(join(cache, action + "-"));
    const propsFile = join(stage, "props.json");
    await writeFile(propsFile, JSON.stringify(props));
    const destination = action === "preview" ? join(cache, "preview") : output;
    const scale = action === "preview" ? (feed ? 0.4 : 0.5) : 1;
    const args = [entry, "ContentProduction", "--props=" + propsFile, "--scale=" + scale, "--log=warn"];
    async function renderCover() {
      const coverFrame = brief.coverFrame ?? 0;
      checkRange(coverFrame, coverFrame + 1, props.timeline.duration, "Cover");
      const coverProps = join(stage, "cover-props.json");
      await writeFile(coverProps, JSON.stringify({...props, cover: true}));
      const cover = join(stage, "cover.jpg");
      remotion("still", entry, "ContentProduction", cover,
        "--props=" + coverProps, "--scale=" + scale, "--log=error",
        "--frame=" + coverFrame, "--image-format=jpeg");
      const [picture] = probe(cover);
      assert(picture?.codec_name === "mjpeg" && picture.width === 1080 * scale && picture.height === 1920 * scale,
        "Invalid reel cover");
      return cover;
    }
    if (action === "cover") {
      assert(brief.format === "reel", "The cover command is for reels");
      const cover = await renderCover();
      await mkdir(destination, {recursive: true});
      await rename(cover, join(destination, "cover.jpg"));
      console.log("Verified " + join(destination, "cover.jpg"));
      return;
    }
    if (moving) {
      const encoded = join(stage, "remotion.mp4");
      remotion("render", ...args, encoded, "--codec=h264", "--pixel-format=yuv420p",
        "--color-space=bt709", "--concurrency=3", "--crf=" + (scale === 1 ? "16" : "22"));
      const video = probe(encoded).find((stream) => stream.codec_type === "video");
      const encoding = video.pix_fmt === "yuv420p" && video.color_space === "bt709" ? ["-c:v", "copy"] : [
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264",
        "-crf", "17", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
      ];
      ff("-y", "-i", encoded, "-map", "0:v:0", ...encoding,
        ...(hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-ac", "2", "-ar", "48000", "-b:a", "256k"] : ["-an"]),
        "-movflags", "+faststart", join(stage, names[0]));
      if (brief.format === "reel") await renderCover();
    } else {
      for (const [index, name] of names.entries()) {
        remotion("still", ...args, join(stage, name), "--frame=" + index);
      }
    }
    const report = verify(stage, scale);
    await mkdir(destination, {recursive: true});
    const caption = join(project, "caption.txt");
    const ancillary = [];
    if (existsSync(join(stage, "cover.jpg"))) ancillary.push("cover.jpg");
    if (scale === 1 && existsSync(caption)) {
      await copyFile(caption, join(stage, "caption.txt"));
      ancillary.push("caption.txt");
    }
    const reportFile = join(cache, action + "-verification.json");
    const previous = existsSync(reportFile) ? json(reportFile) : [];
    for (const name of [...names, ...ancillary]) await rename(join(stage, name), join(destination, name));
    for (const result of previous) {
      const name = basename(result.name);
      if (/^\d{2,}\.png$/.test(name) && !names.includes(name) && result.name === join(destination, name) &&
        existsSync(result.name)) await unlink(result.name);
    }
    await writeFile(reportFile, JSON.stringify(report.map((result, index) =>
      ({...result, name: join(destination, names[index])})), null, 2) + "\n");
    console.log("Verified " + destination);
  } finally {
    try {
      if (stage) await rm(stage, {recursive: true, force: true});
    } finally {
      await lockFile.close();
      await unlink(lock);
    }
  }
}
