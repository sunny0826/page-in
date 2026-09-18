import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const json = (file) =>
  JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
const text = (file) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");
const pkg = json("package.json");
const lock = json("package-lock.json");
const config = json("src-tauri/tauri.conf.json");
const cargo = text("src-tauri/Cargo.toml").match(
  /name = "pagein"\nversion = "([^"]+)"/,
)?.[1];
const cargoLock = text("src-tauri/Cargo.lock").match(
  /name = "pagein"\nversion = "([^"]+)"/,
)?.[1];
for (const [name, version] of Object.entries({
  npmLock: lock.version,
  npmRoot: lock.packages[""].version,
  tauri: config.version,
  cargo,
  cargoLock,
})) {
  assert.equal(
    version,
    pkg.version,
    `${name} version differs from package.json`,
  );
}
assert.equal(pkg.name, "pagein");
assert.equal(lock.name, pkg.name);
assert.equal(lock.packages[""].name, pkg.name);
assert.equal(config.identifier, "io.pagein.desktop");
console.log(`PageIn ${pkg.version}: versions and application identity match.`);
