import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAdminEmail } from '../server/db/adminEmailMigration.js';
test('updates only admin email and preserves password, identity and other users', () => {
  const data = { users: [{ id:'admin', role:'admin', email:'old@example.com', passwordHash:'unchanged', bysUserId:'bys-id' }, {id:'member',role:'user',email:'member@example.com'}] };
  const before = structuredClone(data.users);
  assert.equal(migrateAdminEmail(data), true);
  assert.deepEqual(data.users, [{...before[0],email:'emi.141991e@gmail.com'},before[1]]);
  assert.equal(migrateAdminEmail(data), false);
});
test('does not merge duplicate emails or choose among multiple administrators', () => {
  for (const user of [{id:'other',role:'user',email:'EMI.141991E@gmail.com'}, {id:'other',role:'admin',email:'other@example.com'}]) {
    const data = {users:[{id:'admin',role:'admin',email:'old@example.com'},user]};
    const before = structuredClone(data);
    assert.equal(migrateAdminEmail(data),false);
    assert.deepEqual(data,before);
  }
});
