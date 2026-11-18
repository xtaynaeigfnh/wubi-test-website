import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const action = process.argv[2] ?? "check";
const extra = process.argv.slice(3);
const env = {
  ...process.env,
  WUBI_APP_PLATFORM: "ios",
  PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH ?? ""}`,
};
// Prefer a complete Xcode for this command only; do not change global xcode-select.
if (!env.DEVELOPER_DIR && existsSync("/Applications/Xcode.app/Contents/Developer")) {
  env.DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";
}
// Reuse the team selected in the ignored, generated Xcode project. Never
// persist an Apple account identifier or signing team in tracked config.
const projectFile = "src-tauri/gen/apple/wubi-practice.xcodeproj/project.pbxproj";
if (!env.APPLE_DEVELOPMENT_TEAM && existsSync(projectFile)) {
  const teams = [...readFileSync(projectFile, "utf8").matchAll(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/g)].map((match) => match[1]);
  if (new Set(teams).size === 1) env.APPLE_DEVELOPMENT_TEAM = teams[0];
}

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function available(command, args) {
  return spawnSync(command, args, { env, stdio: "ignore" }).status === 0;
}
if (action === "web") {
  run(process.execPath, ["--import", "./scripts/app-build-env.mjs", "node_modules/next/dist/bin/next", "build"]);
} else {
  if (!["check", "init", "dev", "open", "build", "simulator"].includes(action)) {
    throw new Error(`不支持的 iOS 操作：${action}`);
  }
  if (process.platform !== "darwin") throw new Error("iPhone 构建需要 macOS 与完整 Xcode。");
  if (!available("xcodebuild", ["-version"]) || !available("xcrun", ["--sdk", "iphoneos", "--show-sdk-path"])) {
    console.error("尚未找到完整 Xcode / iPhoneOS SDK。请先安装 Xcode，打开并完成组件安装，再重试。命令行工具不能编译 iPhone App。");
    process.exit(1);
  }
  if (!available("cargo", ["--version"])) throw new Error("请先通过 rustup 安装 Rust 与 Cargo。");
  if (action === "check") {
    run("xcodebuild", ["-version"]);
    run("xcrun", ["--sdk", "iphoneos", "--show-sdk-version"]);
    run("rustup", ["target", "list", "--installed"]);
    console.log("基础环境可用。真机还需在 Xcode 登录 Apple ID、选择签名 Team，并连接已信任的 iPhone。");
  } else {
    if (action !== "init" && !existsSync("src-tauri/gen/apple")) {
      throw new Error("尚未初始化 iOS 工程，请先运行 npm run ios:init。");
    }
    const options = action === "open" ? ["dev", "--open", "--no-watch"]
      : action === "simulator" ? ["build", "--target", "aarch64-sim", "--no-sign"]
      : [action];
    run(process.execPath, ["node_modules/@tauri-apps/cli/tauri.js", "ios", ...options, ...extra]);
  }
}
