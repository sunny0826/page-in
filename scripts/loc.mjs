import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Authored executable source, including tooling and tests. Exclude generated
// permissions, lockfiles, prose, binaries and HTML/SVG fixtures used as test data.
const source = file => /\.(?:ts|tsx|rs|mjs|css)$/.test(file);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const filesAt = ref => git('ls-tree', '-r', '--name-only', ref).trim().split('\n').filter(source);
const lines = text => text.split('\n').length - Number(text.endsWith('\n'));
const count = ref => {
  const files = ref ? filesAt(ref) : git('ls-files', '--cached', '--others', '--exclude-standard').trim().split('\n').filter(source);
  return files.reduce((total, file) => total + lines(ref ? git('show', `${ref}:${file}`) : readFileSync(file, 'utf8')), 0);
};
const base = process.argv[2] ?? '9af26e5';
const before = count(base), after = count(process.argv[3]);
console.log(JSON.stringify({ base, before, after, removed: before - after, reductionPercent: +(100 * (before - after) / before).toFixed(2) }, null, 2));
