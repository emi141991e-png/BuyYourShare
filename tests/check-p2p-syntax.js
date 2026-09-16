import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
}
for (const file of [...walk('server'), ...walk('js')]) {
  const r = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', '--check', file], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('All server and browser JavaScript syntax checks passed.');
