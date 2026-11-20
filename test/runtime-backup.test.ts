import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SentiStore} from '../src/store.ts';
import {createRuntimeBackup,verifyRuntimeBackup,restoreRuntimeBackup} from '../src/backup.ts';

test('a closed runtime directory backs up consistently, verifies, restores, and reads exact business history',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-backup-')),data=join(root,'data'),backup=join(root,'backup'),restored=join(root,'restored');mkdirSync(data,{recursive:true,mode:0o700});
 mkdirSync(join(data,'native','sessions','sentiscope-one'),{recursive:true});mkdirSync(join(data,'native','storage'),{recursive:true});writeFileSync(join(data,'native','sessions','sentiscope-one','session.v4.jsonl'),'{"type":"user/message"}\n');writeFileSync(join(data,'native','storage','schedule.json'),'{}\n');
 let store=new SentiStore({filename:join(data,'business.sqlite')});const owner={enterpriseId:'backup-enterprise',principalId:'operator'};const delegation=store.create(owner,{goal:'Synthetic durable runtime',idempotencyKey:'create'});store.appendMessage(owner,delegation.id,{expectedVersion:1,idempotencyKey:'message',text:'exact business fact'});store.close();
 try{
  const manifest=await createRuntimeBackup(data,backup);
  assert.equal(manifest.kind,'runtime-backup-v1');
  assert.ok(existsSync(join(backup,'business.sqlite')));
  assert.ok(existsSync(join(backup,'manifest.json')));
  assert.ok(existsSync(join(backup,'native','sessions','sentiscope-one','session.v4.jsonl')));
  assert.ok(existsSync(join(backup,'native','storage','schedule.json')));
  assert.deepEqual(await verifyRuntimeBackup(backup),{status:'ok',files:manifest.files.length});
  await restoreRuntimeBackup(backup,restored);
  const reopened=new SentiStore({filename:join(restored,'business.sqlite')});try{
   const value=reopened.get(owner,delegation.id);assert.equal(value.goal,'Synthetic durable runtime');assert.equal(value.messages.at(-1)?.text,'exact business fact');
  }finally{reopened.close();}
  const unlisted=join(root,'backup-unlisted');const unlistedManifest=await createRuntimeBackup(data,unlisted);writeFileSync(join(unlisted,'native','unlisted.json'),'unverified\n');
  assert.equal((await verifyRuntimeBackup(unlisted)).status,'invalid');await assert.rejects(restoreRuntimeBackup(unlisted,join(root,'restore-unlisted')),{code:'runtime_backup_invalid'});
  const corrupted=join(root,'backup-corrupted');await createRuntimeBackup(data,corrupted);writeFileSync(join(corrupted,'native','storage','schedule.json'),'tampered\n');
  assert.equal((await verifyRuntimeBackup(corrupted)).status,'invalid');await assert.rejects(restoreRuntimeBackup(corrupted,join(root,'restore-corrupted')),{code:'runtime_backup_invalid'});
  const escaped=join(root,'backup-escaped');const escapedManifest=await createRuntimeBackup(data,escaped);escapedManifest.files=[{...escapedManifest.files[0],path:'../../outside.txt'}];writeFileSync(join(escaped,'manifest.json'),JSON.stringify(escapedManifest,null,2)+'\n');
  assert.equal((await verifyRuntimeBackup(escaped)).status,'invalid');await assert.rejects(restoreRuntimeBackup(escaped,join(root,'restore-escaped')),{code:'runtime_backup_invalid'});
 }finally{rmSync(root,{recursive:true,force:true});}
});
