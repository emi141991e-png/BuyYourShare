// One-time, explicitly authorized removal. Preserve accounts, access subscriptions and financial history.
export function prepareLegacyCleanup(data, ids) {
  const approved = ['grp-1787421251818', 'grp-1787422031454'];
  if (ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !approved.includes(id))) throw new Error('P2P_CLEANUP_SCOPE_INVALID');
  if (data.systemConfig?.p2pLegacyCleanup20260916) return null;
  const target = new Set(ids);
  const groups = (data.groups || []).filter(g => target.has(g.id));
  const memberships = (data.memberships || []).filter(m => target.has(m.groupId));
  const chats = (data.chats || []).filter(c => target.has(c.groupId));
  const chatIds = new Set(chats.map(c => c.id));
  const messages = (data.chatMessages || []).filter(m => target.has(m.groupId) || chatIds.has(m.chatId));
  const instructions = (data.accessInstructions || []).filter(a => target.has(a.groupId));
  if (groups.length !== 2 || memberships.length !== 3 || chats.length !== 2 || messages.length !== 2 || instructions.length !== 2 ||
      (data.p2pJoinRequests || []).some(r => target.has(r.groupId)) ||
      memberships.some(m => (m.paypalSubscriptionId || m.stripeSubscriptionId) && !m.legacyBillingEndedAt)) throw new Error('P2P_CLEANUP_DATA_CHANGED');
  const next = structuredClone(data);
  next.groups = next.groups.filter(g => !target.has(g.id));
  next.memberships = next.memberships.filter(m => !target.has(m.groupId));
  next.chats = next.chats.filter(c => !target.has(c.groupId));
  next.chatMessages = next.chatMessages.filter(m => !target.has(m.groupId) && !chatIds.has(m.chatId));
  next.accessInstructions = next.accessInstructions.filter(a => !target.has(a.groupId));
  next.systemConfig ||= {};
  next.systemConfig.p2pLegacyCleanup20260916 = { at: new Date().toISOString(), groupIds: ids, counts: { groups:2,memberships:3,chats:2,messages:2,instructions:2 } };
  return next;
}
