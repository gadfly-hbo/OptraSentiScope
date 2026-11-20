import{test}from'node:test';
import assert from'node:assert/strict';
import{createNativeResearchPort}from'./native.ts';
const binding={owner:{enterpriseId:'engineering',principalId:'operator'},delegationId:'goal',goalRevision:1,role:'main',epoch:0,generation:1};
async function fixture(admitModel,beforeStep){const rootEvents=new Map(),scopedEvents=new Map(),reads=[];const event={type:'user/message',seq:3,data:{id:'input-one',role:'user',content:[],source:{kind:'sentiscope',delegationId:'goal',sourceRefs:[]}}};
 const agent={session:{firstLiveSeq:0},cancel(){},async whenIdle(){}};const scoped={tools:{restrict(){},register(){}},on(name,callback){scopedEvents.set(name,callback);return()=>scopedEvents.delete(name);}};
 const ctx={on(name,callback){rootEvents.set(name,callback);return()=>rootEvents.delete(name);},sessions:{async flush(){return true;}},sessionPersistence:{async open(){return{async read(){return{events:[event]};},async close(){}};}},agents:{async create(options){options.setup(scoped,agent).commit();return{agent,async dispose(){}};}}};
 const port=createNativeResearchPort(ctx,{modelStream:async function*(_fact,_request,next){if(!admitModel)throw Error('RESOURCE_DENIED');yield*next();}});
 const handle=await port.open(binding,{sessionId:'owned',tools:[],model:{provider:'synthetic',model:'local'},admit:()=>true,beforeStep,onRead:f=>reads.push(f)});
 scopedEvents.get('session/event')(null,{type:'step/start',data:{turn:1,step:1},seq:2});scopedEvents.get('session/event')(null,event);
 return{rootEvents,scopedEvents,port,handle,reads};}
test('a persisted user surface blocked by Host model dispatch does not become a business read',async()=>{const f=await fixture(false);let adapter=0;
 try{await assert.rejects(async()=>{for await(const _ of f.rootEvents.get('llm/stream')({sessionId:'owned'},async function*(){adapter++;yield{type:'finish',reason:{kind:'stop'}};})){}},/RESOURCE_DENIED/);assert.equal(adapter,0);assert.equal(f.reads.length,0);}finally{await f.port.dispose();}});
test('approved native dispatch publishes each durable input once even when the SDK retries',async()=>{const f=await fixture(true);let adapter=0;
 try{for(let i=0;i<2;i++)for await(const _ of f.rootEvents.get('llm/stream')({sessionId:'owned'},async function*(){adapter++;yield{type:'finish',reason:{kind:'stop'}};})){}assert.equal(adapter,2);assert.deepEqual(f.reads.map(r=>r.messageId),['input-one']);}finally{await f.port.dispose();}});

test('business observation may decline a scheduled step without claiming an input was read',async()=>{const seen=[];const f=await fixture(true,async(b,fact)=>{seen.push({b,fact});return false;});let next=0;
 try{const result=await f.scopedEvents.get('agent/pre-step')({turn:2,step:1,messages:[{source:{kind:'schedule'}}]},async()=>{next++;return{kind:'accept'};});assert.deepEqual(result,{kind:'reject'});assert.equal(next,0);assert.deepEqual(seen.map(x=>x.fact),[{turn:2,step:1,scheduledOnly:true}]);assert.equal(f.reads.length,0);}finally{await f.port.dispose();}});
