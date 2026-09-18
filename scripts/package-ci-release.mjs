import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
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
const notices = [
  "PageIn third-party component notices",
  `Platform: ${platform}`,
  "Includes build-time dependencies.",
];
function notice(name, version, license, directory, extraFile) {
  notices.push(
    `\n${"=".repeat(72)}\n${name} ${version}\nDeclared license: ${license ?? "See package sources"}\n`,
  );
  const files = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(licen[cs]e|copying|notice)(?:[._-]|$)/i.test(entry.name),
    )
    .map((entry) => entry.name);
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
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const [directory, info] of Object.entries(lock.packages)) {
  if (!directory || !existsSync(directory)) continue;
  const meta = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  notice(meta.name, info.version, info.license ?? meta.license, directory);
}
const metadata = JSON.parse(
  run("cargo", [
    "metadata",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--format-version",
    "1",
    "--locked",
    "--filter-platform",
    target,
  ]),
);
for (const info of metadata.packages
  .filter((item) => item.source)
  .sort((a, b) => a.name.localeCompare(b.name))) {
  notice(
    info.name,
    info.version,
    info.license,
    path.dirname(info.manifest_path),
    info.license_file,
  );
}
writeFileSync(
  path.join(output, `THIRD-PARTY-NOTICES-${platform}.txt`),
  notices.join("\n"),
);
const install =
  platform === "windows-x64"
    ? `运行 ${stem}-setup.exe 安装。需要 Microsoft WebView2；缺失时安装程序联网下载。\n此安装程序未进行 Windows 代码签名。\n`
    : `Omarchy / Linux x64：下载 ${stem}.AppImage，执行 chmod +x ${stem}.AppImage 后运行。\n若提示缺少 FUSE，可尝试 ./${stem}.AppImage --appimage-extract-and-run。\n.deb 仅用于 Debian/Ubuntu，不用于 Omarchy。\n`;
writeFileSync(
  path.join(output, `INSTALL-${platform}.txt`),
  `PageIn ${pkg.version}\n\n${install}\nCI 已执行自动测试和构建；尚未在 Windows / Omarchy 实机验证安装、启动、编辑、放映和导出。\n源码：v0.0.1 (${sourceCommit})\n本正式版按维护者授权替换同版本预发布；旧安装包和校验和不再适用。\n`,
);
const digest = (name) => {
  const bytes = readFileSync(path.join(output, name));
  return {
    name,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};
const files = readdirSync(output).sort().map(digest);
const manifestName = `manifest-${platform}.json`;
writeFileSync(
  path.join(output, manifestName),
  JSON.stringify(
    {
      product: "PageIn",
      version: pkg.version,
      platform,
      target,
      sourceTag: "v0.0.1",
      sourceCommit,
      workflowCommit: process.env.GITHUB_SHA,
      workflowRun: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      signing: "unsigned",
      runtimeVerification: "pending user verification",
      builtAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ) + "\n",
);
files.push(digest(manifestName));
writeFileSync(
  path.join(output, `SHA256SUMS-${platform}.txt`),
  files.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n",
);
console.log(
  `Prepared ${platform}: ${files.map((file) => file.name).join(", ")}`,
);
