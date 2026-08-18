/**
 * BuyYourShare - MoneyEngine (MoneySplit deterministico in centesimi interi)
 * Garantisce matematicamente che la SOMMA DI TUTTE LE QUOTE BASE sia SEMPRE ESATTAMENTE UGUALE al costo reale.
 */

export function eurosToCents(euros) {
  if (typeof euros === 'number') {
    return Math.round(euros * 100);
  }
  const cleanStr = String(euros || '0').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export function centsToEuros(cents) {
  const c = parseInt(cents, 10);
  return isNaN(c) ? 0 : c / 100;
}

export function formatCents(cents) {
  const euros = centsToEuros(cents);
  return euros.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * MoneySplitEngine: Divide l'importo totale in centesimi per il numero di posti
 * distribuendo determinicaticamente i centesimi di resto uno alla volta.
 * 
 * GARANZIA MATEMATICA:
 * Sum(shares) === totalCostCents SEMPRE (Zero scostamenti, zero frazioni perse).
 * 
 * @param {number} totalCostCents - Costo totale in centesimi interi
 * @param {number} totalSlots - Numero totale di posti
 * @returns {Array<number>} Array di quote in centesimi interi per ogni posto
 */
export function moneySplit(totalCostCents, totalSlots) {
  const cost = parseInt(totalCostCents, 10);
  const slots = parseInt(totalSlots, 10);
  if (isNaN(cost) || cost <= 0 || isNaN(slots) || slots <= 0) return [];

  const base = Math.floor(cost / slots);
  const remainder = cost % slots;

  const shares = [];
  for (let i = 0; i < slots; i++) {
    // I primi 'remainder' posti ricevono 1 centesimo in più per assorbire il resto esatto
    shares.push(i < remainder ? base + 1 : base);
  }
  return shares;
}

/**
 * Calcola l'analisi completa del MoneySplit per il riepilogo.
 * @param {number} totalCostCents 
 * @param {number} totalSlots 
 */
export function calculateMoneySplitBreakdown(totalCostCents, totalSlots) {
  const shares = moneySplit(totalCostCents, totalSlots);
  if (shares.length === 0) {
    return {
      shares: [],
      sumCents: 0,
      minShareCents: 0,
      maxShareCents: 0,
      isUniform: true,
      displayShareText: '0,00 €'
    };
  }

  const sumCents = shares.reduce((acc, s) => acc + s, 0);
  const minShareCents = Math.min(...shares);
  const maxShareCents = Math.max(...shares);
  const isUniform = minShareCents === maxShareCents;

  const displayShareText = isUniform 
    ? formatCents(minShareCents)
    : `${formatCents(minShareCents)} - ${formatCents(maxShareCents)}`;

  return {
    shares,
    sumCents, // Sempre === totalCostCents
    minShareCents,
    maxShareCents,
    isUniform,
    displayShareText,
    typicalMemberShareCents: maxShareCents // Quota di riferimento per i primi posti
  };
}
