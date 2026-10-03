// Owner-requested marketplace login change, applied once to the existing admin.
export function migrateAdminEmail(data) {
  const key = 'adminEmail20260929';
  if (data.systemConfig?.[key]) return false;
  const admins = (data.users || []).filter(user => user.role === 'admin');
  if (admins.length !== 1) {
    console.warn('[ADMIN EMAIL] Not applied: expected exactly one administrator.');
    return false;
  }
  const admin = admins[0];
  const email = 'emi.141991e@gmail.com';
  if (data.users.some(user => user.id !== admin.id && user.email?.trim().toLowerCase() === email)) {
    console.warn('[ADMIN EMAIL] Not applied: destination email already belongs to another account.');
    return false;
  }
  admin.email = email;
  data.systemConfig ||= {};
  data.systemConfig[key] = { userId: admin.id, appliedAt: new Date().toISOString() };
  console.log('[ADMIN EMAIL] Updated marketplace admin email; password unchanged.');
  return true;
}
