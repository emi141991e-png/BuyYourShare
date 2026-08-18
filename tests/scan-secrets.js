import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const IGNORED_DIRS = ['node_modules', '.git', 'tools', 'scratch'];
const IGNORED_FILES = ['.env', '.env.local', 'scan-secrets.js'];

let detectedSecrets = 0;

function scanDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(ROOT, fullPath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(item)) {
        scanDir(fullPath);
      }
    } else {
      if (IGNORED_FILES.includes(item) || item.endsWith('.log')) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Controlli di sicurezza pattern
      if (content.match(/sk_live_[0-9a-zA-Z]{24,}/)) {
        console.error(`❌ TROVATA CHIAVE STRIPE LIVE in: ${relPath}`);
        detectedSecrets++;
      }
      if (content.match(/sk_test_[0-9a-zA-Z]{24,}/) && !relPath.includes('.env.example')) {
        console.error(`❌ TROVATA CHIAVE STRIPE TEST in: ${relPath}`);
        detectedSecrets++;
      }
      if (content.match(/whsec_[0-9a-zA-Z]{24,}/) && !relPath.includes('.env.example')) {
        console.error(`❌ TROVATO STRIPE WEBHOOK SECRET in: ${relPath}`);
        detectedSecrets++;
      }
    }
  }
}

console.log('====================================================');
console.log('       SCANSIONE DI SICUREZZA PRE-COMMIT            ');
console.log('====================================================');
scanDir(ROOT);

if (detectedSecrets === 0) {
  console.log('✅ NESSUN SECRET O TOKEN RILEVATO NEL CODICE SORGENTE.');
  console.log('Tutti i parametri sensibili sono delegati alle variabili d\'ambiente .env / Railway.');
} else {
  console.error(`❌ RILEVATI ${detectedSecrets} SEGRETI. Correggere prima del commit!`);
  process.exit(1);
}
