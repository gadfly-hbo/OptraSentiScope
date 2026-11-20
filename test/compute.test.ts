import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createClosedComputePort} from '../src/compute.ts';
import type {RunBinding} from '../runtime/index.ts';
const root=resolve('.local/archives/host-controls-v01-20261117/compute');
mkdirSync(root,{recursive:true});
const binding:RunBinding={owner:{enterpriseId:'synthetic-enterprise',principalId:'operator'},delegationId:'synthetic-delegation',goalRevision:1,role:'worker',assignmentId:'synthetic-assignment',epoch:1,generation:1};
const current=(input:RunBinding)=>JSON.stringify(input)===JSON.stringify(binding);

test('no configured compute world never dispatches an executable or advertises local readiness',async()=>{
  const directory=mkdtempSync(join(root,'closed-world-'));const target=join(directory,'must-not-exist');
  try {
    const port=createClosedComputePort({admit:current});
    assert.deepEqual(port.status(binding),{status:'unavailable',reason:'isolation_unconfigured'});
    const result=await port.run(binding,{command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(target)},'unexpected execution')`],timeoutMs:1000,inputRefs:[]});
    assert.deepEqual(result,{status:'unavailable',code:'compute_unavailable',reason:'isolation_unconfigured',dispatched:false});
    assert.equal(existsSync(target),false);
    assert.deepEqual(await port.cancel(binding),{status:'not_dispatched',reason:'isolation_unconfigured',resourcesDispatched:0});
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('foreign owner and stale assignment qualifications cannot use or cancel another delegation',async()=>{
  const port=createClosedComputePort({admit:current});
  for(const stale of [
    {...binding,owner:{...binding.owner,enterpriseId:'foreign-enterprise'}},
    {...binding,owner:{...binding.owner,principalId:'foreign-operator'}},
    {...binding,delegationId:'foreign-delegation'},
    {...binding,goalRevision:2},
    {...binding,assignmentId:'foreign-assignment'},
    {...binding,epoch:2},
    {...binding,generation:2},
  ]) {
    assert.throws(()=>port.status(stale),{code:'stale_compute_binding'});
    await assert.rejects(port.run(stale,{command:['ignored'],timeoutMs:1000,inputRefs:[]}),{code:'stale_compute_binding'});
    await assert.rejects(port.cancel(stale),{code:'stale_compute_binding'});
  }
  assert.equal((await port.run(binding,{command:['ignored'],timeoutMs:1000,inputRefs:[]})).dispatched,false);
  const denied=createClosedComputePort({admit:()=>{throw new Error('SYNTHETIC_PRIVATE_HOST_DETAIL');}});
  await assert.rejects(denied.run(binding,{command:['ignored'],timeoutMs:1000,inputRefs:[]}),(error:unknown)=>{
    assert.equal((error as {code:string}).code,'stale_compute_binding');assert.ok(!String(error).includes('SYNTHETIC_PRIVATE_HOST_DETAIL'));return true;
  });
});

test('unconfigured compute refuses extra Host paths, environments, enabled flags and malformed resource requests without echoing them',async()=>{
  const port=createClosedComputePort({admit:current});
  const valid={command:['ignored'],timeoutMs:1000,inputRefs:[{ref:'synthetic-source',hash:'a'.repeat(64)}]};
  for(const request of [null,[],{},
    {...valid,command:[]},{...valid,command:['']},{...valid,command:['bad\u0000argument']},{...valid,command:'shell string'},
    {...valid,timeoutMs:0},{...valid,timeoutMs:Infinity},{...valid,timeoutMs:1.5},{...valid,timeoutMs:2147483648},
    {...valid,inputRefs:'arbitrary path'}, {...valid,inputRefs:[{ref:'synthetic-source',hash:'not-a-hash'}]},
    {...valid,inputRefs:[{...valid.inputRefs[0],path:'/SYNTHETIC_HOST_PRIVATE'}]},
    {...valid,cwd:'/SYNTHETIC_HOST_PRIVATE'}, {...valid,env:{SYNTHETIC_SECRET:'not-a-real-secret'}},
    {...valid,isolated:true}, {...valid,enabled:true}, {...valid,owner:{enterpriseId:'other'}},
  ]) {
    await assert.rejects(port.run(binding,request),(error:unknown)=>{
      assert.equal((error as {code:string}).code,'invalid_compute_request');
      assert.ok(!String(error).includes('SYNTHETIC_HOST_PRIVATE'));assert.ok(!String(error).includes('not-a-real-secret'));return true;
    });
  }
  assert.deepEqual(await port.run(binding,valid),{status:'unavailable',code:'compute_unavailable',reason:'isolation_unconfigured',dispatched:false});
});
