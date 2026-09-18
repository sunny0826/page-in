import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { thirdPartyNotices, writeInventory, readJSON } from "./release-common.mjs";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const platform = process.argv[2];
assert(["windows-x64", "linux-x64"].includes(platform), "Unknown platform");
assert.equal(process.arch, "x64");
assert.equal(process.platform, platform === "windows-x64" ? "win32" : "linux");
const root = process.cwd();
await import(pathToFileURL(path.join(root, "scripts/check-version.mjs")));
const pkg = readJSON("package.json");
assert.equal(pkg.version, "0.0.1");
const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
const sourceCommit = run("git", ["rev-parse", "HEAD"]);
assert.match(process.env.EXPECTED_SOURCE_COMMIT ?? "", /^[0-9a-f]{40}$/);
assert.equal(sourceCommit, process.env.EXPECTED_SOURCE_COMMIT);
assert.equal(
  run("git", ["status", "--porcelain", "--untracked-files=no"]),
  "",
  "Release source must be clean",
);
const output = path.join(root, "release-assets");
assert(!existsSync(output), "Refusing to overwrite release assets");
mkdirSync(output);
const stem = `PageIn_${pkg.version}_${platform}`;
const bundles =
  platform === "windows-x64"
    ? [["nsis", ".exe", `${stem}-setup.exe`, "MZ"]]
    : [
        ["appimage", ".AppImage", `${stem}.AppImage`, "\x7fELF"],
        ["deb", ".deb", `${stem}.deb`, "!<arch>\n"],
      ];
for (const [folder, extension, name, magic] of bundles) {
  const directory = path.join(root, "src-tauri/target/release/bundle", folder);
  const matches = readdirSync(directory).filter((file) =>
    file.endsWith(extension),
  );
  assert.equal(matches.length, 1, `Expected one ${extension} package`);
  const source = path.join(directory, matches[0]);
  const bytes = readFileSync(source);
  assert(bytes.length > 1024, `Empty or truncated package: ${source}`);
  assert.equal(bytes.subarray(0, magic.length).toString("latin1"), magic);
  copyFileSync(source, path.join(output, name));
}

const target =
  platform === "windows-x64"
    ? "x86_64-pc-windows-msvc"
    : "x86_64-unknown-linux-gnu";
writeFileSync(path.join(output, `THIRD-PARTY-NOTICES-${platform}.txt`), thirdPartyNotices(run, target, [
  `Platform: ${platform}`, "Includes build-time dependencies.",
]));
const install =
  platform === "windows-x64"
    ? `运行 ${stem}-setup.exe 安装。需要 Microsoft WebView2；缺失时安装程序联网下载。\n此安装程序未进行 Windows 代码签名。\n`
    : `Omarchy / Linux x64：下载 ${stem}.AppImage，执行 chmod +x ${stem}.AppImage 后运行。\n若提示缺少 FUSE，可尝试 ./${stem}.AppImage --appimage-extract-and-run。\n.deb 仅用于 Debian/Ubuntu，不用于 Omarchy。\n`;
writeFileSync(
  path.join(output, `INSTALL-${platform}.txt`),
  `PageIn ${pkg.version}\n\n${install}\nCI 已执行自动测试和构建；尚未在 Windows / Omarchy 实机验证安装、启动、编辑、放映和导出。\n源码：v0.0.1 (${sourceCommit})\n本正式版按维护者授权替换同版本预发布；旧安装包和校验和不再适用。\n`,
);
const files = writeInventory(output, {
  version: pkg.version, platform, target, sourceTag: "v0.0.1", sourceCommit,
  workflowCommit: process.env.GITHUB_SHA,
  workflowRun: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  signing: "unsigned", runtimeVerification: "pending user verification",
}, `manifest-${platform}.json`, `SHA256SUMS-${platform}.txt`);
console.log(
  `Prepared ${platform}: ${files.map((file) => file.name).join(", ")}`,
);
