import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function startDevServer(port) {
  const server = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)),
    "dev", "--hostname", "127.0.0.1", "--port", String(port),
  ], { stdio: ["ignore", "ignore", "inherit"], detached: process.platform !== "win32", windowsHide: true });
  // Preserve launch errors for the readiness loop instead of emitting an
  // unhandled error or waiting for the full startup timeout.
  server.on("error", (error) => { server.startupError = error; });
  return server;
}

export function assertServerRunning(server) {
  if (server.startupError) throw server.startupError;
  if (server.exitCode !== null || server.signalCode !== null) {
    throw new Error(`测试开发服务器已退出：${server.exitCode ?? server.signalCode}`);
  }
}

export async function stopDevServer(server) {
  if (!server?.pid) return;
  if (process.platform === "win32") {
    await new Promise((done) => {
      execFile("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }, () => done());
    });
  } else {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
}

export function resolveExportPath(root, pathname, paths = path) {
  const file = paths.resolve(root, `.${pathname || "/"}`);
  const relative = paths.relative(root, file);
  if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error("outside export");
  }
  return file;
}
