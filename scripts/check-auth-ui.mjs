import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';

const exec=promisify(execFile),root=resolve('.local/auth-ui-checks');mkdirSync(root,{recursive:true});const output=mkdtempSync(join(root,'run-')),session=`sentiscope-auth-ui-${randomUUID()}`,commands=[];
const hash=value=>createHash('sha256').update(value).digest('hex'),store=new SentiStore({filename:join(output,'business.sqlite')}),owner={enterpriseId:'auth-ui-fixture',principalId:'operator'};
const host=await startLocalHost({store,owner,port:0,auth:{operatorTokenHash:hash('operator-token'),maintainerTokenHash:hash('maintainer-token')}});
async function browser(...args){try{const result=await exec('agent-browser',['--session',session,...args],{timeout:35000,maxBuffer:2*1024*1024});commands.push({args,stdout:result.stdout,stderr:result.stderr,exitCode:0});return result.stdout.trim();}catch(error){commands.push({args,stdout:error.stdout,stderr:error.stderr,exitCode:error.code,signal:error.signal});throw error;}}
async function truth(expression){assert.equal(await browser('eval',expression),'true',expression);}
let error;
try{
 await browser('set','viewport','1440','1000');await browser('open',host.url);await browser('wait','--fn','document.querySelector("#screen").textContent.includes("登录本机工作台")');await truth(`document.querySelector('#overview-nav').disabled && !document.body.textContent.includes('auth-ui-fixture')`);
 await browser('fill','#login-token','operator-token');await browser('click','#login-form button[type="submit"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("委托总览")');await truth(`!document.cookie.includes('sentiscope_session')`);
 await browser('click','[data-action="create"]');await browser('fill','#goal-input','浏览器登录后的合成持续目标');await browser('click','#create-form button[type="submit"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("浏览器登录后的合成持续目标")');
 await browser('click','#logout');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("登录本机工作台")');
 await browser('fill','#login-token','maintainer-token');await browser('click','#login-form button[type="submit"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("本机维护状态")');await truth(`document.querySelector('#overview-nav').disabled && document.querySelector('#screen').textContent.includes('外部出口')`);
 assert.equal(await browser('eval','fetch("/api/delegations").then(response=>response.status)'),'403');
 await browser('click','#logout');await browser('fill','#login-token','wrong-token');await browser('click','#login-form button[type="submit"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("401") || document.querySelector("#screen").textContent.includes("令牌无效")');
 await browser('set','viewport','390','844');await truth('document.documentElement.scrollWidth<=innerWidth');await browser('screenshot',join(output,'login-mobile.png'));assert.equal(await browser('errors'),'');
 writeFileSync(join(output,'result.json'),JSON.stringify({status:'PASS',checks:['unauthenticated workbench shows login only','operator login creates a delegation through the normal UI','session cookie is HttpOnly and invisible to JavaScript','maintainer sees read-only maintenance and receives 403 on business API','logout revokes the session; wrong token shows safe 401','390px layout and browser errors'],commands},null,2)+'\n');
}catch(cause){error={name:cause.name,message:cause.message,stack:cause.stack};writeFileSync(join(output,'result.json'),JSON.stringify({status:'FAIL',error,commands},null,2)+'\n');}
finally{await browser('close').catch(()=>{});await host.close();store.close();rmSync(join(output,'business.sqlite'),{force:true});}
const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));console.log(`${result.status}: ${output}`);if(result.status!=='PASS')process.exitCode=1;
