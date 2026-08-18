import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function searchAll(dir, query) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'tools') {
        searchAll(full, query);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.json'))) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes(query)) {
        console.log(`MATCH [${query}] in: ${path.relative(ROOT, full)}`);
      }
    }
  }
}

console.log('=== SEARCHING FOR ALL DEMO STRINGS ===');
searchAll(ROOT, 'Accesso Rapido Demo');
searchAll(ROOT, 'btn-demo-quick');
searchAll(ROOT, 'userSwitcher');
searchAll(ROOT, 'Password123!');
searchAll(ROOT, 'Default: Password123!');
searchAll(ROOT, 'switch-demo');
searchAll(ROOT, 'switchUser');
