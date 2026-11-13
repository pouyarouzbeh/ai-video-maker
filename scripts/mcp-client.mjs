import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { root } from "./project.mjs";

export async function withMcp(kind, operation, env = process.env) {
  const server = spawn(process.execPath, [join(root, "scripts", "mcp-launch.mjs"), kind], {
    cwd: root, env, stdio: ["pipe", "pipe", "inherit"],
  });
  const reader = createInterface({ input: server.stdout });
  const pending = new Map();
  let nextId = 1;

  reader.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  function disconnected(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  server.on("error", disconnected);
  server.on("exit", (status) => disconnected(new Error(kind + " MCP stopped (" + status + ")")));
  server.stdin.on("error", disconnected);

  const send = (message) => server.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  function request(method, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(kind + " MCP timeout: " + method));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }

  try {
    const hello = await request("initialize", {
      protocolVersion: "2025-03-26", capabilities: {},
      clientInfo: { name: "portfolio-reels", version: "1.0.0" },
    });
    send({ method: "notifications/initialized" });
    const { tools } = await request("tools/list", {});
    return await operation({
      name: hello.serverInfo.name,
      tools,
      call: async (name, args, timeout) => {
        if (!tools.some((tool) => tool.name === name)) throw new Error(kind + " MCP missing tool " + name);
        const response = await request("tools/call", { name, arguments: args }, timeout);
        const content = response.content?.find(({ type }) => type === "text")?.text;
        if (response.isError) throw new Error(content || "MCP call failed");
        let decoded = response.structuredContent;
        if (!decoded && content) {
          try { decoded = JSON.parse(content); } catch { decoded = content; }
        }
        if (typeof decoded?.result === "string") {
          try { decoded = JSON.parse(decoded.result); } catch { /* Ordinary string result. */ }
        }
        if (decoded?.success === false || decoded?.status === "failed" || decoded?.error || decoded?.timed_out) {
          throw new Error(JSON.stringify(decoded).slice(-4000));
        }
        return decoded;
      },
    });
  } finally {
    server.stdin.end();
    reader.close();
  }
}
