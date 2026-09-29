import { publicSubscription } from './p2pSubscription.js';

export function adminOverview(data, now = Date.now()) {
  const users = data.users || [];
  const subscriptions = (data.p2pSubscriptions || []).map(s => {
    const user = users.find(u => u.id === s.userId);
    const view = publicSubscription(s, now);
    return { userId: s.userId, name: user?.fullName || 'Utente', email: user?.email || '',
      status: view.status, accessAllowed: view.accessAllowed, role: view.role,
      providerSubscriptionId: s.providerSubscriptionId || null, currentPeriodEnd: view.currentPeriodEnd,
      cancelAtPeriodEnd: view.cancelAtPeriodEnd, lastPaymentAt: s.lastPaymentAt || null };
  });
  const requests = (data.p2pManualRequests || []).map(r => ({ id: r.id, groupId: r.groupId,
    groupName: (data.groups || []).find(g => g.id === r.groupId)?.customServiceName || 'Gruppo archiviato',
    member: users.find(u => u.id === r.userId)?.fullName || 'Membro',
    leader: users.find(u => u.id === r.ownerId)?.fullName || 'Capogruppo',
    status: r.status, amountCents: r.amountCents, periodEnd: r.periodEnd || null }));
  return { subscriptions, requests, activeCount: subscriptions.filter(s => s.accessAllowed).length,
    attentionCount: subscriptions.filter(s => ['pending','past_due','suspended'].includes(s.status)).length };
}
