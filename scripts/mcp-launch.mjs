import { spawn } from "node:child_process";
import { join, normalize } from "node:path";
import { blenderBin, locateFfmpeg, root } from "./project.mjs";

const kind = process.argv[2];
const isWindows = process.platform === "win32";
const bin = join(root, ".tools", "blender-venv", isWindows ? "Scripts" : "bin");
const ffmpegScript = join(root, ".agents", "skills", "ffmpeg-skill", "mcp", "server.py");
let command;
let args;
let env;

if (kind === "blender") {
  command = join(bin, isWindows ? "python.exe" : "blender-mcp-server");
  args = isWindows ? [join(root, "scripts", "blender-mcp-win.py")] : [];
  env = { ...process.env, BLENDER_BIN: normalize(blenderBin()), PYTHONUTF8: "1" };
} else if (kind === "ffmpeg") {
  const tools = await locateFfmpeg();
  command = process.env.REEL_PYTHON || (isWindows ? "python" : "python3");
  args = ["-u", ffmpegScript];
  env = { ...tools.env, PYTHONUTF8: "1" };
} else {
  throw new Error("Specify the blender or ffmpeg MCP server");
}

const server = spawn(command, args, { cwd: root, env, stdio: ["pipe", "inherit", "inherit"] });
process.stdin.pipe(server.stdin);
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
server.on("exit", (status) => process.exit(status ?? 1));
process.on("SIGTERM", () => server.kill());
