import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('email transport is disabled in tests and fails honestly without configuration', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bys-email-test-'));
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, 'database.json');
  writeFileSync(process.env.DATABASE_PATH, JSON.stringify({ users: [], systemConfig: {} }));
  for (const key of ['GMAIL_APP_PASSWORD','SMTP_HOST','SMTP_USER','SMTP_PASS','RESEND_API_KEY','BREVO_API_KEY']) delete process.env[key];
  const { emailService } = await import('../server/services/emailService.js');
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden'); };
  try {
    process.env.NODE_ENV = 'test';
    assert.equal((await emailService.sendMail({ to: 'test@example.test', subject: 'test', text: 'test' })).status, 'SKIPPED');
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_DELIVERY_DISABLED = 'false';
    assert.equal(emailService.getTransporter(), null);
    assert.equal((await emailService.sendMail({ to: 'test@example.test', subject: 'test', text: 'test' })).status, 'FAILED');
    assert.equal(networkCalls, 0);
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.GMAIL_APP_PASSWORD = 'test-only-not-a-secret';
    process.env.RESEND_API_KEY = 'test-only-not-a-key';
    process.env.EMAIL_FROM = 'BuyYourShare <noreply@example.test>';
    assert.equal(emailService.getTransporter(), null);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(JSON.parse(options.body).from, process.env.EMAIL_FROM);
      networkCalls++;
      return { ok:true, json:async()=>({id:'mock-only'}) };
    };
    assert.equal((await emailService.sendMail({to:'test@example.test',subject:'test',text:'test'})).status,'DELIVERED_RESEND');
    assert.equal(networkCalls,1);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
