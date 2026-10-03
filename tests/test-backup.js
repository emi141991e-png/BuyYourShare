import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {backupAuthorized,backupRecords} from '../server/routes/backup.js';
test('backup export is disabled without a strong secret and rejects user bearer tokens',()=>{
 assert.equal(backupAuthorized('Bearer anything',''),false);assert.equal(backupAuthorized('Bearer session','x'.repeat(48)),false);assert.equal(backupAuthorized('Bearer '+'x'.repeat(48),'x'.repeat(48)),true);
});
test('backup exports snapshot and only referenced private photos, fails on missing data',async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'bys-backup-test-'));try{
 await fs.writeFile(path.join(d,'push-vapid.json'),'{}');await fs.mkdir(path.join(d,'private-chat-attachments'));
 const id='00000000-0000-0000-0000-000000000000';await fs.writeFile(path.join(d,'private-chat-attachments',id+'.jpg'),'photo');await fs.writeFile(path.join(d,'unrelated-secret'),'excluded');
 const snapshot={users:[{id:'test'}],p2pPrivateMessages:[{attachment:{id}}]};const lines=[];for await(const row of backupRecords(snapshot,d))lines.push(JSON.parse(row));assert.equal(lines.at(-1).files,3);assert.equal(lines.some(r=>r.path==='unrelated-secret'),false);assert.deepEqual(JSON.parse(Buffer.from(lines[1].data,'base64')),snapshot);
 await fs.unlink(path.join(d,'private-chat-attachments',id+'.jpg'));await assert.rejects(async()=>{for await(const row of backupRecords(snapshot,d)){};});
 }finally{await fs.rm(d,{recursive:true,force:true});}
});
