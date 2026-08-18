import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function searchInDir(dir, pattern, label) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'tools') {
        searchInDir(full, pattern, label);
      }
    } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
      const content = fs.readFileSync(full, 'utf8');
      if (pattern.test(content)) {
        console.log(`[${label}] Match in file: ${path.relative(ROOT, full)}`);
        const lines = content.split('\n');
        lines.forEach((l, idx) => {
          if (pattern.test(l)) {
            console.log(`   Line ${idx + 1}: ${l.trim().slice(0, 100)}`);
          }
        });
      }
    }
  }
}

console.log('=== SEARCHING FOR DEMO GROUPS / SEED SOURCES ===');
searchInDir(ROOT, /Canva for Teams/i, 'Canva Teams');
searchInDir(ROOT, /Piano Standard/i, 'Piano Standard');
searchInDir(ROOT, /YouTube Famigli/i, 'YouTube Famiglia');
searchInDir(ROOT, /grp-1042/i, 'grp-1042');
searchInDir(ROOT, /grp-1089/i, 'grp-1089');
searchInDir(ROOT, /grp-1120/i, 'grp-1120');
searchInDir(ROOT, /buyyourshare_db/i, 'buyyourshare_db');
searchInDir(ROOT, /PRESET_GROUPS/i, 'PRESET_GROUPS');
searchInDir(ROOT, /mockGroups/i, 'mockGroups');
searchInDir(ROOT, /demoGroups/i, 'demoGroups');
