import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { thirdPartyNotices, writeInventory } from '../scripts/release-common.mjs';

test('release inventory hashes exact bytes, excludes itself, and supports platform filenames', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pagein-inventory-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'package.exe'), Buffer.from([0, 255, 13, 10]));
  writeFileSync(path.join(directory, 'INSTALL.txt'), '中文\r\n');
  const files = writeInventory(directory, { sourceCommit: 'a'.repeat(40), signing: 'unsigned' }, 'manifest-windows-x64.json', 'SHA256SUMS-windows-x64.txt');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest-windows-x64.json'), 'utf8'));
  assert.equal(manifest.sourceCommit, 'a'.repeat(40));
  assert.equal(manifest.signing, 'unsigned');
  assert.deepEqual(manifest.files.map(file => file.name), ['INSTALL.txt', 'package.exe']);
  assert.deepEqual(files.map(file => file.name), ['INSTALL.txt', 'package.exe', 'manifest-windows-x64.json']);
  for (const file of files) {
    const bytes = readFileSync(path.join(directory, file.name));
    assert.equal(file.bytes, bytes.length);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(readFileSync(path.join(directory, 'SHA256SUMS-windows-x64.txt'), 'utf8'), files.map(f => `${f.sha256}  ${f.name}\n`).join(''));
});

test('notices include installed npm licenses and sorted Cargo source licenses exactly once', t => {
  const cwd = process.cwd(), directory = mkdtempSync(path.join(tmpdir(), 'pagein-notices-'));
  t.after(() => { process.chdir(cwd); rmSync(directory, { recursive: true, force: true }); });
  process.chdir(directory);
  mkdirSync('node_modules/example', { recursive: true });
  mkdirSync('crate');
  writeFileSync('package-lock.json', JSON.stringify({ packages: { '': {}, missing: {}, 'node_modules/example': { version: '1', license: 'MIT' } } }));
  writeFileSync('node_modules/example/package.json', JSON.stringify({ name: 'example' }));
  writeFileSync('node_modules/example/LICENSE', 'npm license text');
  writeFileSync('crate/LICENSE', 'cargo license text');
  const run = (command, args) => {
    assert.equal(command, 'cargo');
    assert.ok(args.includes('--locked'));
    assert.equal(args.at(-1), 'test-target');
    return JSON.stringify({ packages: [
      { name: 'local-project', source: null },
      { name: 'crate', version: '2', source: 'registry', license: 'Apache-2.0', manifest_path: path.join(directory, 'crate/Cargo.toml'), license_file: 'LICENSE' },
    ] });
  };
  const notices = thirdPartyNotices(run, 'test-target', ['Platform: test']);
  assert.ok(notices.includes('example 1\nDeclared license: MIT'));
  assert.ok(notices.includes('crate 2\nDeclared license: Apache-2.0'));
  assert.equal(notices.split('cargo license text').length, 2);
  assert.ok(notices.includes('npm license text'));
  assert.ok(!notices.includes('local-project'));
});
