import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const output = path.join(root, "releases", pkg.version);
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

// Include license texts shipped with installed components, including build tools
// for a conservative inventory. No user documents enter the release stage.
const notices = [
  "PageIn third-party component notices",
  "Generated from installed npm and Cargo packages. Includes build-time dependencies.",
  "",
];
function notice(name, version, license, directory, extraFile) {
  notices.push(
    `\n${"=".repeat(72)}\n${name} ${version}\nDeclared license: ${license ?? "See package sources"}\n`,
  );
  const files = readdirSync(directory, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() && /^(licen[cs]e|copying|notice)(?:[._-]|$)/i.test(e.name),
    )
    .map((e) => e.name);
  if (
    extraFile &&
    existsSync(path.join(directory, extraFile)) &&
    !files.includes(extraFile)
  )
    files.push(extraFile);
  for (const file of files.sort())
    notices.push(
      `--- ${file} ---\n${readFileSync(path.join(directory, file), "utf8")}`,
    );
}
const npmLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [directory, info] of Object.entries(npmLock.packages)) {
  if (!directory || !existsSync(directory)) continue;
  const meta = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  notice(meta.name, info.version, info.license ?? meta.license, directory);
}
const cargo = JSON.parse(
  run("cargo", [
    "metadata",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--format-version",
    "1",
    "--locked",
    "--filter-platform",
    "aarch64-apple-darwin",
  ]),
);
for (const info of cargo.packages
  .filter((p) => p.source)
  .sort((a, b) => a.name.localeCompare(b.name))) {
  notice(
    info.name,
    info.version,
    info.license,
    path.dirname(info.manifest_path),
    info.license_file,
  );
}
const licenseText = notices.join("\n");
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
  const install = `PageIn ${pkg.version}\n\nmacOS 13+ / Apple Silicon (arm64)\n\n将 PageIn.app 拖到 Applications 进行安装。\nDrag PageIn.app to Applications to install.\n\n此构建使用 ad-hoc 签名，尚未进行 Developer ID 签名与 Apple 公证。\nThis build is ad-hoc signed, without Developer ID signing or Apple notarization.\n\n打开 HTML 或包含 index.html 的项目目录；导出始终创建新的文件或目录。\n演示预览为静态分页，导出保留原始脚本。\n`;
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
  const files = readdirSync(output)
    .sort()
    .map((name) => {
      const bytes = readFileSync(path.join(output, name));
      return {
        name,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
  writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        product: "PageIn",
        version: pkg.version,
        identifier: config.identifier,
        platform: "macOS",
        architecture: "arm64",
        minimumSystemVersion: "13.0",
        signing: "ad-hoc",
        notarized: false,
        builtAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ) + "\n",
  );
  const manifest = readFileSync(path.join(output, "manifest.json"));
  files.push({
    name: "manifest.json",
    sha256: createHash("sha256").update(manifest).digest("hex"),
  });
  writeFileSync(
    path.join(output, "SHA256SUMS"),
    files.map((f) => `${f.sha256}  ${f.name}`).join("\n") + "\n",
  );
  console.log(`Prepared PageIn ${pkg.version}: ${output}`);
  console.log(files.map((f) => f.name).join("\n"));
} catch (error) {
  // Only this newly reserved output directory belongs to this invocation.
  rmSync(output, { recursive: true, force: true });
  throw error;
} finally {
  rmSync(stage, { recursive: true, force: true });
}
