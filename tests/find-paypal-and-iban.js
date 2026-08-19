import fs from 'fs';

const files = ['js/app.js', 'js/services/stripeCheckoutService.js', 'js/services/stripeConnectService.js', 'server/routes/connect.js', 'server/routes/checkout.js', 'server/data/database.json', 'server/db/seedData.js'];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  console.log(`=== ${file} ===`);
  lines.forEach((l, idx) => {
    if (l.toLowerCase().includes('paypal') || l.toLowerCase().includes('iban') || l.toLowerCase().includes('bank') || l.toLowerCase().includes('sandbox')) {
      if (l.length > 140) l = l.substring(0, 140) + '...';
      console.log(`  Line ${idx+1}: ${l.trim()}`);
    }
  });
}
