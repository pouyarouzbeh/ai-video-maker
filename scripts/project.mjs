import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const slug = process.env.REEL_PROJECT || "peony";
if (!/^[a-z\d][a-z\d-]*$/.test(slug)) throw new Error("Invalid REEL_PROJECT");
export const project = join(root, "projects", slug);
export const assets = join(root, "public", slug);
export const output = join(root, "out", slug);
export const cache = join(root, ".cache", slug);
export const brief = json(join(project, "brief.json"));
export const timelinePath = join(project, "timeline.json");
export const timeline = existsSync(timelinePath) ? json(timelinePath) : null;

export function json(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

export function fingerprint(...parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

export async function locateFfmpeg() {
  const windows = process.platform === "win32";
  const suffix = windows ? ".exe" : "";
  const pathDirs = (process.env.PATH || "").split(delimiter);
  const packageRoot = join(process.env.LOCALAPPDATA || root, "Microsoft", "WinGet", "Packages");
  const packages = await readdir(packageRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of packages.filter((item) => item.name.startsWith("Gyan.FFmpeg_"))) {
    const folder = join(packageRoot, entry.name);
    const releases = await readdir(folder).catch(() => []);
    pathDirs.push(join(folder, "bin"), ...releases.map((release) => join(folder, release, "bin")));
  }
  const paths = [process.env.REEL_FFMPEG_BIN, join(root, ".tools", "ffmpeg", "bin"), ...pathDirs];
  for (const dir of paths.filter(Boolean)) {
    const ffmpeg = resolve(dir, "ffmpeg" + suffix);
    const ffprobe = resolve(dir, "ffprobe" + suffix);
    if (existsSync(ffmpeg) && existsSync(ffprobe)) {
      return { ffmpeg, ffprobe, env: { ...process.env, PATH: dir + delimiter + process.env.PATH } };
    }
  }
  throw new Error("FFmpeg and FFprobe unavailable. Install Gyan.FFmpeg or set REEL_FFMPEG_BIN.");
}

export function blenderBin() {
  return process.env.BLENDER_BIN || (process.platform === "win32"
    ? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
    : "blender");
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " exited with " + result.status);
  return result.stdout;
}
