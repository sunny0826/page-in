import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
export function thirdPartyNotices(run, target, headings) {
  const notices = ['PageIn third-party component notices', ...headings];
  function append(name, version, license, directory, extraFile) {
    notices.push(`\n${'='.repeat(72)}\n${name} ${version}\nDeclared license: ${license ?? 'See package sources'}\n`);
    const files = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)(?:[._-]|$)/i.test(entry.name))
      .map(entry => entry.name);
    if (extraFile && existsSync(path.join(directory, extraFile)) && !files.includes(extraFile)) files.push(extraFile);
    for (const file of files.sort()) notices.push(`--- ${file} ---\n${readFileSync(path.join(directory, file), 'utf8')}`);
  }
  for (const [directory, info] of Object.entries(readJSON('package-lock.json').packages)) {
    if (!directory || !existsSync(directory)) continue;
    const meta = readJSON(path.join(directory, 'package.json'));
    append(meta.name, info.version, info.license ?? meta.license, directory);
  }
  const cargo = JSON.parse(run('cargo', [
    'metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--format-version', '1', '--locked', '--filter-platform', target,
  ]));
  for (const info of cargo.packages.filter(p => p.source).sort((a, b) => a.name.localeCompare(b.name))) {
    append(info.name, info.version, info.license, path.dirname(info.manifest_path), info.license_file);
  }
  return notices.join('\n');
}

export function writeInventory(output, metadata, manifestName = 'manifest.json', sumsName = 'SHA256SUMS') {
  const digest = name => {
    const bytes = readFileSync(path.join(output, name));
    return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const files = readdirSync(output).sort().map(digest);
  const manifest = { product: 'PageIn', ...metadata, builtAt: new Date().toISOString(), files };
  writeFileSync(path.join(output, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  files.push(digest(manifestName));
  writeFileSync(path.join(output, sumsName), files.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
  return files;
}
