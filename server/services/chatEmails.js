// Durable jobs are created together with each new private chat message.
// Historical notifications are never replayed as email after deployment.
export class ChatEmails {
  constructor(subscriptions, mailer, now = () => Date.now()) {
    this.subscriptions = subscriptions;
    this.repo = subscriptions.repo;
    this.mailer = mailer;
    this.now = now;
  }
  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      const ids = (this.repo.data.notifications || []).filter(n =>
        n.id.startsWith('chat:') && n.emailDelivery?.status === 'pending' &&
        n.emailDelivery.nextAttemptAt <= this.now()).slice(0, 20).map(n => n.id);
      for (const id of ids) {
        const mail = await this.subscriptions.exclusive(async () => {
          const n = this.repo.data.notifications.find(n => n.id === id);
          if (!n || n.emailDelivery.status !== 'pending') return;
          const r = (this.repo.data.p2pManualRequests || []).find(r => r.id === n.requestId);
          const g = this.repo.data.groups.find(g => g.id === r?.groupId);
          const m = (this.repo.data.p2pPrivateMessages || []).find(m => m.id === n.messageId && m.requestId === r?.id);
          const recipient = (this.repo.data.users || []).find(u => u.id === n.userId);
          const expected = m?.senderId === r?.userId ? g?.ownerId : m?.senderId === g?.ownerId ? r?.userId : null;
          if (!expected || expected !== n.userId || expected === m.senderId || !recipient?.email) {
            n.emailDelivery.status='canceled';
            try { await this.repo.save(); } catch(e) { n.emailDelivery.status='pending'; throw e; }
            return;
          }
          const url = `https://buyyourshare.it/api/auth/p2p?next=${encodeURIComponent('#privata-' + r.id)}`;
          return {to: recipient.email, subject: 'Hai un nuovo messaggio su BuyYourShare',
            text: `Hai ricevuto un messaggio nella chat privata del tuo gruppo. Apri la conversazione per leggerlo e rispondere: ${url}\nNon rispondere a questa email: usa la chat su BYS.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h2>Hai un nuovo messaggio</h2><p>Ti hanno scritto nella chat privata del tuo gruppo su BuyYourShare.</p><p><a style="display:inline-block;background:#3659e3;color:white;padding:14px 22px;border-radius:10px;text-decoration:none" href="${url}">Leggi e rispondi</a></p><p>Non rispondere a questa email: usa la chat su BYS.</p></div>`,
            idempotencyKey: `bys-chat-${m.id}-${n.userId}`};
        });
        if (!mail) continue;
        let result;
        try { result = await this.mailer.sendMail(mail); } catch { result = {status:'FAILED'}; }
        await this.subscriptions.exclusive(async () => {
          const n = this.repo.data.notifications.find(n => n.id === id);
          if (!n) return;
          const previous = structuredClone(n.emailDelivery);
          const delivered = result?.status?.startsWith('DELIVERED_');
          n.emailDelivery = {status: delivered ? 'sent' : 'pending', attempts: previous.attempts + 1,
            lastAttemptAt: this.now(), nextAttemptAt: this.now() + Math.min(3600000, 30000 * 2 ** Math.min(previous.attempts, 7)),
            ...(delivered ? {sentAt:this.now()} : {})};
          try { await this.repo.save(); } catch (e) { n.emailDelivery = previous; throw e; }
        });
      }
    } finally { this.running = false; }
  }
}
