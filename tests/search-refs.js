import fs from 'fs';
import path from 'path';

function searchDir(dir, query) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'node_modules' && f.name !== '.git' && f.name !== 'tools') searchDir(full, query);
    } else if (f.name.endsWith('.js') || f.name.endsWith('.json') || f.name.endsWith('.html') || f.name.endsWith('.env')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Match [${query}] in: ${full}`);
      }
    }
  }
}

console.log('=== SEARCH IBAN ===');
searchDir('.', 'iban');

console.log('\n=== SEARCH SANDBOX ===');
searchDir('.', 'sandbox');

console.log('\n=== SEARCH API-M ===');
searchDir('.', 'api-m');

console.log('\n=== SEARCH PAYPAL_MODE ===');
searchDir('.', 'paypal_mode');
