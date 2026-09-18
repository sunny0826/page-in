import { execFileSync } from "node:child_process";
import { thirdPartyNotices, writeInventory, readJSON } from "./release-common.mjs";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import "./check-version.mjs";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
assert.equal(process.platform, "darwin", "Build this release on macOS");
assert.equal(
  process.arch,
  "arm64",
  "This release is validated for Apple Silicon only",
);
const run = (command, args = []) =>
  execFileSync("rtk", ["proxy", command, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
const pkg = readJSON("package.json");
const config = readJSON("src-tauri/tauri.conf.json");
const sourceCommit = run("git", ["rev-parse", "HEAD"]).trim();
assert.match(sourceCommit, /^[0-9a-f]{40}$/);
assert.equal(
  run("git", ["status", "--porcelain", "--untracked-files=no"]).trim(),
  "",
  "Release source must be clean",
);
const output = path.join(
  root,
  "releases",
  `${pkg.version}-${sourceCommit.slice(0, 12)}`,
);
assert(!existsSync(output), `Release directory already exists: ${output}`);
const bundle = path.join(
  root,
  "src-tauri/target/release/bundle/macos/PageIn.app",
);
const plistValue = (app, key) =>
  run("/usr/libexec/PlistBuddy", [
    "-c",
    `Print :${key}`,
    path.join(app, "Contents/Info.plist"),
  ]).trim();
assert.equal(plistValue(bundle, "CFBundleShortVersionString"), pkg.version);
assert.equal(plistValue(bundle, "CFBundleVersion"), pkg.version);
assert.equal(plistValue(bundle, "CFBundleIdentifier"), config.identifier);
assert.equal(
  run("/usr/bin/lipo", [
    "-archs",
    path.join(bundle, "Contents/MacOS/pagein"),
  ]).trim(),
  "arm64",
);

const licenseText = thirdPartyNotices(run, "aarch64-apple-darwin", [
  "Generated from installed npm and Cargo packages. Includes build-time dependencies.", "",
]);
const stage = mkdtempSync(path.join(root, ".release-stage-"));
mkdirSync(output, { recursive: true });
try {
  const stagedApp = path.join(stage, "PageIn.app");
  run("/usr/bin/ditto", [bundle, stagedApp]);
  writeFileSync(
    path.join(stagedApp, "Contents/Resources/THIRD-PARTY-NOTICES.txt"),
    licenseText,
  );
  run("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    stagedApp,
  ]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", stagedApp]);
  const stem = `PageIn_${pkg.version}_macos-arm64`;
  const zip = path.join(output, `${stem}.zip`);
  const dmg = path.join(output, `${stem}.dmg`);
  run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    stagedApp,
    zip,
  ]);
  symlinkSync("/Applications", path.join(stage, "Applications"));
  const install = `PageIn ${pkg.version}\n\nmacOS 13+ / Apple Silicon (arm64)\n\n将 PageIn.app 拖到 Applications 进行安装。\nDrag PageIn.app to Applications to install.\n\n此构建使用 ad-hoc 签名，尚未进行 Developer ID 签名与 Apple 公证。\nThis build is ad-hoc signed, without Developer ID signing or Apple notarization.\n\n打开 HTML 或包含 index.html 的项目目录；导出始终创建新的文件或目录。\n放映支持可信内置动效，预览不执行原页面脚本；导出保留原始脚本。\n源码：v${pkg.version} (${sourceCommit})\n本正式版按维护者授权替换同版本预发布；旧安装包和校验和不再适用。\n`;
  writeFileSync(path.join(stage, "使用说明.txt"), install);
  writeFileSync(path.join(output, "INSTALL.txt"), install);
  writeFileSync(path.join(output, "THIRD-PARTY-NOTICES.txt"), licenseText);
  cpSync(
    `docs/releases/${pkg.version}.md`,
    path.join(output, "RELEASE-NOTES.md"),
  );
  run("/usr/bin/hdiutil", [
    "create",
    "-volname",
    `PageIn ${pkg.version}`,
    "-srcfolder",
    stage,
    "-format",
    "UDZO",
    "-fs",
    "HFS+",
    dmg,
  ]);
  run("/usr/bin/hdiutil", ["verify", dmg]);
  const files = writeInventory(output, {
    version: pkg.version, identifier: config.identifier, platform: "macOS", architecture: "arm64",
    sourceTag: `v${pkg.version}`, sourceCommit, minimumSystemVersion: "13.0", signing: "ad-hoc", notarized: false,
    runtimeVerification: "Package integrity checked; desktop runtime verification is recorded separately",
  });
  console.log(`Prepared PageIn ${pkg.version}: ${output}`);
  console.log(files.map((f) => f.name).join("\n"));
} catch (error) {
  // Only this newly reserved output directory belongs to this invocation.
  rmSync(output, { recursive: true, force: true });
  throw error;
} finally {
  rmSync(stage, { recursive: true, force: true });
}
