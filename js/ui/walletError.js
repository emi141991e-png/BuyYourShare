// Only a bounded machine code may be shown: never serialize payment/token data.
export function walletErrorCode(error, stage) {
  const candidate = error?.details?.[0]?.issue || error?.code || error?.name;
  return `${stage}:${typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{2,79}$/.test(candidate) ? candidate : 'NON_COMPLETATO'}`;
}
