/**
 * BuyYourShare - Server MoneyEngine
 * Algoritmo deterministico MoneySplit per la ripartizione esatta delle quote dei piani familiari.
 */

export function allocateMoneySplit(totalCents, slotsCount) {
  if (slotsCount <= 0) return [];
  const base = Math.floor(totalCents / slotsCount);
  const remainder = totalCents % slotsCount;

  const shares = [];
  for (let i = 0; i < slotsCount; i++) {
    shares.push(i < remainder ? base + 1 : base);
  }
  return shares;
}

export function calculatePricingBreakdown(realCostCents, totalSlots = 6, platformFeeCents = 149) {
  const tSlots = parseInt(totalSlots, 10) || 6;
  const cost = parseInt(realCostCents, 10) || 0;
  const shares = allocateMoneySplit(cost, tSlots);

  const minBaseShareCents = shares.length > 0 ? Math.min(...shares) : 0;
  const maxBaseShareCents = shares.length > 0 ? Math.max(...shares) : 0;
  const baseMemberShareCents = minBaseShareCents;

  const sumExactSharesCents = shares.reduce((a, b) => a + b, 0);
  const memberTotalCents = baseMemberShareCents + platformFeeCents;

  let displayShareText = '';
  if (minBaseShareCents === maxBaseShareCents) {
    displayShareText = `${(baseMemberShareCents / 100).toFixed(2)} €`;
  } else {
    displayShareText = `${(minBaseShareCents / 100).toFixed(2)} € – ${(maxBaseShareCents / 100).toFixed(2)} €`;
  }

  return {
    realCostCents: cost,
    totalSlots: tSlots,
    platformFeeCents: platformFeeCents,
    shares: shares,
    minBaseShareCents: minBaseShareCents,
    maxBaseShareCents: maxBaseShareCents,
    baseMemberShareCents: baseMemberShareCents,
    memberTotalCents: memberTotalCents,
    displayShareText: displayShareText,
    sumExactSharesCents: sumExactSharesCents
  };
}

export function getGroupSlotsBreakdown(group, memberships = [], requestingUser = null) {
  const totalSlots = group.totalSlots || 6;
  const ownerSlots = group.ownerSlots || 1;
  const realCostCents = group.realSubscriptionCostCents || 0;
  const feeCents = group.platformFeeCents || 149;

  const shares = allocateMoneySplit(realCostCents, totalSlots);
  const groupMemberships = memberships.filter(m => m.groupId === group.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));

  const slots = [];
  for (let i = 1; i <= totalSlots; i++) {
    const isOwner = i <= ownerSlots;
    const baseShare = shares[i - 1] || Math.floor(realCostCents / totalSlots);
    const assignedMembership = groupMemberships.find(m => m.slotNumber === i);
    const isOccupied = isOwner || !!assignedMembership;

    slots.push({
      slotNumber: i,
      isOwnerSlot: isOwner,
      isOccupied: isOccupied,
      baseShareCents: baseShare,
      platformFeeCents: isOwner ? 0 : feeCents,
      memberTotalCents: isOwner ? baseShare : (baseShare + feeCents),
      assignedUserId: isOwner ? group.ownerId : (assignedMembership ? assignedMembership.userId : null)
    });
  }

  const availableSlotsList = slots.filter(s => !s.isOccupied);
  const baseShares = availableSlotsList.map(s => s.baseShareCents);

  return {
    slots: slots,
    availableSlotsCount: availableSlotsList.length,
    nextAvailableSlot: availableSlotsList[0] || null,
    minBaseShareCents: baseShares.length > 0 ? Math.min(...baseShares) : group.baseMemberShareCents,
    maxBaseShareCents: baseShares.length > 0 ? Math.max(...baseShares) : group.baseMemberShareCents,
    minMemberTotalCents: (baseShares.length > 0 ? Math.min(...baseShares) : group.baseMemberShareCents) + feeCents,
    maxMemberTotalCents: (baseShares.length > 0 ? Math.max(...baseShares) : group.baseMemberShareCents) + feeCents
  };
}
