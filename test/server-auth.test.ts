import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';

const owner={enterpriseId:'auth-enterprise',principalId:'auth-operator'};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const auth={operatorTokenHash:hash('operator-token'),maintainerTokenHash:hash('maintainer-token')};
const cookieOf=(response:Response)=>response.headers.get('set-cookie')!.split(';')[0];

test('local login binds owner and separates operator from maintainer without storing raw tokens',async()=>{
 const store=new SentiStore({filename:':memory:'});let host=await startLocalHost({store,owner,port:0,auth});
 try{
  assert.equal((await fetch(`${host.url}/api/delegations`)).status,401);
  assert.equal((await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'unauthorized',idempotencyKey:'x'})})).status,401);
  assert.equal((await fetch(`${host.url}/api/maintenance`)).status,401);
  const wrong=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'wrong'})});assert.equal(wrong.status,401);
  const operatorLogin=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'operator-token'})});assert.equal(operatorLogin.status,200);
  const setCookie=operatorLogin.headers.get('set-cookie')!;assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const operatorCookie=cookieOf(operatorLogin);
  const session=await (await fetch(`${host.url}/api/session`,{headers:{Cookie:operatorCookie}})).json() as {role:string;owner:typeof owner};assert.equal(session.role,'operator');assert.deepEqual(session.owner,owner);
  const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:operatorCookie},body:JSON.stringify({goal:'authorized synthetic goal',idempotencyKey:'create'})});assert.equal(created.status,201);
  assert.equal((await fetch(`${host.url}/api/maintenance`,{headers:{Cookie:operatorCookie}})).status,403);
  const maintainerLogin=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'maintainer-token'})});assert.equal(maintainerLogin.status,200);const maintainerCookie=cookieOf(maintainerLogin);
  assert.equal((await fetch(`${host.url}/api/maintenance`,{headers:{Cookie:maintainerCookie}})).status,200);
  assert.equal((await fetch(`${host.url}/api/delegations`,{headers:{Cookie:maintainerCookie}})).status,403);
  assert.equal((await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:maintainerCookie},body:JSON.stringify({goal:'forbidden',idempotencyKey:'forbidden'})})).status,403);
  const raw=JSON.stringify(store.connection.prepare('SELECT * FROM auth_sessions').all());assert.ok(!raw.includes('operator-token')&&!raw.includes('maintainer-token'));
  assert.equal((await fetch(`${host.url}/api/logout`,{method:'POST',headers:{Cookie:operatorCookie}})).status,200);
  assert.equal((await fetch(`${host.url}/api/session`,{headers:{Cookie:operatorCookie}})).status,401);
  assert.equal((await fetch(`${host.url}/api/delegations`,{headers:{Cookie:operatorCookie}})).status,401);
  assert.equal((await fetch(`${host.url}/api/session`,{headers:{Cookie:maintainerCookie}})).status,200);
 }finally{await host.close();store.close();}
});

test('local sessions survive Host restart and login attempts are rate limited',async()=>{
 const directory='.local/auth-tests';const {mkdirSync,mkdtempSync,rmSync}=await import('node:fs');const {join}=await import('node:path');mkdirSync(directory,{recursive:true});const root=mkdtempSync(join(directory,'run-')),filename=join(root,'business.sqlite');
 let store=new SentiStore({filename}),host=await startLocalHost({store,owner,port:0,auth});let cookie:string;
 try{
  const login=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'operator-token'})});cookie=cookieOf(login);await host.close();store.close();
  store=new SentiStore({filename});host=await startLocalHost({store,owner,port:0,auth});assert.equal((await fetch(`${host.url}/api/session`,{headers:{Cookie:cookie}})).status,200);
  for(let index=0;index<5;index++)assert.equal((await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:`wrong-${index}`})})).status,401);
  assert.equal((await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'wrong-again'})})).status,429);
 }finally{await host.close();store.close();rmSync(root,{recursive:true,force:true});}
});

test('production local host refuses to start without role hashes while explicit engineering fixtures may bypass',async()=>{
 const store=new SentiStore({filename:':memory:'});
 try{
  await assert.rejects(startLocalHost({store,owner,port:0}),{code:'auth_configuration_required'});
  const host=await startLocalHost({store,owner,port:0,allowUnauthenticated:true});
  try{const session=await (await fetch(`${host.url}/api/session`)).json() as {role:string};assert.equal(session.role,'operator');assert.equal((await fetch(`${host.url}/api/delegations`)).status,200);}finally{await host.close();}
 }finally{store.close();}
});
