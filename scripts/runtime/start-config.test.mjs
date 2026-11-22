import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const start=resolve(project,'scripts/runtime/start.mjs');
function run(args){return new Promise((accept,reject)=>{const child=spawn(process.execPath,[start,...args],{cwd:project});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal,stdout,stderr}));});}
test('start.mjs rejects a non-boolean syntheticTrial flag before launching the harness',async()=>{
 const root=resolve(project,'.local/start-config-tests',`run-${Date.now()}`);mkdirSync(root,{recursive:true});
 try{
  const config=resolve(root,'bad.json');writeFileSync(config,JSON.stringify({syntheticTrial:'yes'}));
  const result=await run(['--config',config,'--runtime-root',resolve(root,'runtime')]);
  assert.equal(result.code,1);assert.match(result.stderr,/INVALID_SYNTHETIC_TRIAL/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('start.mjs accepts only a safe launcher instance id',async()=>{
 const root=resolve(project,'.local/start-config-tests',`run-${Date.now()}`);mkdirSync(root,{recursive:true});
 try{
  const result=await run(['--instance-id','unsafe value']);
  assert.equal(result.code,1);assert.match(result.stderr,/INVALID_INSTANCE_ID/);
  const help=await run(['--help']);assert.equal(help.code,0);assert.match(help.stdout,/--instance-id/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('start.mjs help documents the syntheticTrial flag and source default scope',async()=>{
 const result=await run(['--help']);assert.equal(result.code,0);assert.match(result.stdout,/syntheticTrial/);assert.match(result.stdout,/sentiscope-synthetic-trial/);assert.match(result.stdout,/goalIncludes/);
});
test('start.mjs rejects an incomplete source default policy before launching the harness',async()=>{
 const root=resolve(project,'.local/start-config-tests',`run-${Date.now()}`);mkdirSync(root,{recursive:true});
 try{
  const config=resolve(root,'bad-sources.json');writeFileSync(config,JSON.stringify({resourceDefaults:{sources:{grants:[]}}}));
  const result=await run(['--config',config,'--runtime-root',resolve(root,'runtime')]);
  assert.equal(result.code,1);assert.match(result.stderr,/INVALID_SOURCE_DEFAULT_SCOPE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('start.mjs rejects duplicate source default grant identities',async()=>{
 const root=resolve(project,'.local/start-config-tests',`run-${Date.now()}`);mkdirSync(root,{recursive:true});
 try{
  const grant={sourceId:'shared',directory:'.local/source',grantRevision:1,enabled:true};
  const config=resolve(root,'duplicate-sources.json');writeFileSync(config,JSON.stringify({resourceDefaults:{sources:{goalIncludes:'synthetic',grants:[grant,grant]}}}));
  const result=await run(['--config',config,'--runtime-root',resolve(root,'runtime')]);
  assert.equal(result.code,1);assert.match(result.stderr,/INVALID_SOURCE_GRANT_DUPLICATE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});