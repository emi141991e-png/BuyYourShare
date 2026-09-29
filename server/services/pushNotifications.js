import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { P2pError } from './p2pSubscription.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
export function loadPushKeys(directory = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data')) {
  // Kept on the same persistent volume as the database, never in client assets or Git.
  const filename = path.join(directory, 'push-vapid.json');
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(filename)) {
    try { fs.writeFileSync(filename, JSON.stringify(webpush.generateVAPIDKeys()), { flag: 'wx', mode: 0o600 }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const keys = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!keys.publicKey || !keys.privateKey) throw new Error('PUSH_KEYS_INVALID');
  return keys;
}

export function validatePushSubscription(input) {
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new P2pError('INVALID_PUSH_SUBSCRIPTION', 400);
  let url; try { url = new URL(input.endpoint); } catch { throw new P2pError('INVALID_PUSH_SUBSCRIPTION', 400); }
  const trusted = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw new P2pError('UNSUPPORTED_PUSH_PROVIDER', 400);
  const { p256dh, auth } = input.keys || {};
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65 ||
      typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(auth) || Buffer.from(auth, 'base64url').length !== 16) throw new P2pError('INVALID_PUSH_KEYS', 400);
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export class PushNotifications {
  constructor(subscriptions, { now = () => Date.now(), keys = loadPushKeys, send = webpush.sendNotification.bind(webpush) } = {}) {
    this.subscriptions = subscriptions; this.repo = subscriptions.repo; this.now = now; this.keys = keys; this.send = send; this.running = false;
  }
  devices() { return this.repo.data.pushSubscriptions ||= []; }
  jobs() { return this.repo.data.pushDeliveries ||= []; }
  exclusive(fn) { return this.subscriptions.exclusive(async () => {
    const devices = structuredClone(this.repo.data.pushSubscriptions), jobs = structuredClone(this.repo.data.pushDeliveries);
    try { return await fn(); } catch (e) { this.repo.data.pushSubscriptions = devices; this.repo.data.pushDeliveries = jobs; throw e; }
  }); }
  config(userId) {
    return { available: true, publicKey: this.keys().publicKey, devices: this.devices().filter(d => d.userId === userId).map(d => ({
      id: d.id, label: d.label, createdAt: d.createdAt,
      lastTestStatus: this.jobs().filter(j => j.deviceId === d.id && j.test).sort((a, b) => b.createdAt - a.createdAt)[0]?.status || null
    })) };
  }
  subscribe(userId, input, label) { return this.exclusive(async () => {
    this.keys();
    const subscription = validatePushSubscription(input), existing = this.devices().find(d => d.subscription.endpoint === subscription.endpoint);
    if (existing && existing.userId !== userId) throw new P2pError('PUSH_DEVICE_OTHER_ACCOUNT', 409);
    if (existing) { existing.subscription = subscription; await this.repo.save(); return { id: existing.id }; }
    if (this.devices().filter(d => d.userId === userId).length >= 10) throw new P2pError('PUSH_DEVICE_LIMIT', 409);
    const d = { id: randomUUID(), userId, subscription, label: String(label || 'Dispositivo').slice(0, 80), createdAt: new Date(this.now()).toISOString() };
    this.devices().push(d); await this.repo.save(); return { id: d.id };
  }); }
  remove(userId, id) { return this.exclusive(async () => {
    const device = this.devices().find(d => d.id === id && d.userId === userId);
    if (!device) throw new P2pError('PUSH_DEVICE_NOT_FOUND', 404);
    this.repo.data.pushSubscriptions = this.devices().filter(d => d.id !== device.id);
    this.repo.data.pushDeliveries = this.jobs().filter(j => j.deviceId !== device.id);
    await this.repo.save();
  }); }
  test(userId, id) { return this.exclusive(async () => {
    const d = this.devices().find(d => d.id === id && d.userId === userId);
    if (!d) throw new P2pError('PUSH_DEVICE_NOT_FOUND', 404);
    if (d.lastTestAt && this.now() - Date.parse(d.lastTestAt) < 60000) throw new P2pError('PUSH_TEST_RATE_LIMIT', 429);
    d.lastTestAt = new Date(this.now()).toISOString();
    const job = { id: randomUUID(), deviceId: d.id, userId, status: 'pending', attempts: 0, createdAt: this.now(), nextAttemptAt: this.now(), test: true };
    this.jobs().push(job); await this.repo.save(); return { queued: true };
  }); }
  relevant(notification) {
    if (notification?.id.startsWith('bank-renew:')) {
      const s = this.subscriptions.find(notification.userId);
      if (s?.paymentMethod !== 'BANK' || s.currentPeriodEnd !== notification.bankPeriodEnd) return false;
      const remaining = Date.parse(s.currentPeriodEnd) - this.now();
      return notification.id.endsWith(':before') ? remaining > 0 && remaining <= 3 * DAY : remaining <= 0;
    }
    const r = (this.repo.data.p2pManualRequests || []).find(r => r.id === notification?.requestId);
    if (!r || r.status !== 'confirmed' || !r.periodEnd || !notification.id.startsWith(`renew:${r.id}:${r.periodEnd}:`)) return false;
    const remaining = Date.parse(r.periodEnd) - this.now();
    return notification.id.endsWith(':before') ? remaining > 0 && remaining <= 3 * DAY : remaining <= 0;
  }
  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      const selected = await this.exclusive(async () => {
        const notifications = (this.repo.data.notifications || []).filter(n => (n.id.startsWith('renew:') || n.id.startsWith('bank-renew:')) && this.relevant(n) && this.now() - Date.parse(n.createdAt) <= DAY);
        let changed = false;
        for (const n of notifications) for (const d of this.devices().filter(d => d.userId === n.userId && Date.parse(d.createdAt) <= Date.parse(n.createdAt))) {
          const id = `${n.id}:${d.id}`;
          if (this.jobs().some(j => j.id === id)) continue;
          this.jobs().push({ id, deviceId: d.id, userId: n.userId, notificationId: n.id, status: 'pending', attempts: 0, createdAt: this.now(), nextAttemptAt: this.now() }); changed = true;
        }
        const oldCount = this.jobs().length;
        this.repo.data.pushDeliveries = this.jobs().filter(j => this.now() - j.createdAt < 30 * DAY);
        if (changed || oldCount !== this.jobs().length) await this.repo.save();
        return this.jobs().filter(j => j.status === 'pending' && j.nextAttemptAt <= this.now()).slice(0, 10).map(j => j.id);
      });
      for (const id of selected) {
        const job = this.jobs().find(j => j.id === id);
        const device = job && this.devices().find(d => d.id === job.deviceId && d.userId === job.userId);
        if (!job) continue;
        const n = (this.repo.data.notifications || []).find(n => n.id === job.notificationId);
        if (!device || (!job.test && !this.relevant(n)) || this.now() - job.createdAt > DAY) {
          await this.exclusive(async () => { job.status = 'canceled'; await this.repo.save(); }); continue;
        }
        const tag = createHash('sha256').update(job.id).digest('hex').slice(0, 32);
        // Generic lock-screen content: never disclose names, IBAN, amounts or messages.
        const payload = JSON.stringify({ title: 'BuyYourShare', body: job.test ? 'Le notifiche push sono pronte su questo dispositivo.' : 'Hai un promemoria di pagamento. Apri il marketplace per i dettagli.', tag, url: '/#notifiche' });
        let status = 'sent', errorCode = null;
        try {
          await this.send(device.subscription, payload, { TTL: 3600, timeout: 10000, urgency: 'normal', topic: tag,
            vapidDetails: { subject: 'mailto:info@buyyourshare.com', ...this.keys() } });
        } catch (e) { errorCode = Number(e.statusCode) || 0; status = 'pending'; }
        await this.exclusive(async () => {
          const current = this.jobs().find(j => j.id === id); if (!current) return;
          current.attempts++; current.lastAttemptAt = this.now(); current.lastErrorCode = errorCode;
          if ([404, 410].includes(errorCode)) { this.repo.data.pushSubscriptions = this.devices().filter(d => d.id !== device.id); status = 'expired'; }
          else if ([400, 401, 403, 413].includes(errorCode) || current.attempts >= 6 && status !== 'sent') status = 'failed';
          current.status = status; current.nextAttemptAt = this.now() + Math.min(HOUR, 60000 * 2 ** current.attempts);
          await this.repo.save();
        });
      }
    } finally { this.running = false; }
  }
}
