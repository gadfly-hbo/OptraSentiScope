import type {Context} from '@deepseek-ai/cordis';
import {parseCredentialKey} from '@deepseek-ai/dsh-credentials';
import {Engine} from 'dsh-superagent';
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';
import {ResearchCoordinator} from '../src/research.ts';
import type {ResearchOptions} from '../src/research.ts';
import type {BudgetConfig} from '../src/budget.ts';
import type {CredentialGrant} from '../src/credentials.ts';
import type {ModelEgressGrant} from '../src/egress.ts';
import type {BriefPreferences} from '../src/notifications.ts';
import {HostControls} from './controls.ts';
import type {HostDefaults,LocalModelRoute} from './controls.ts';
import type {LocalAuthConfig} from '../src/auth.ts';
import {createNativeResearchPort} from './native.ts';
import {SYNTHETIC_TRIAL_PROVIDER} from './synthetic.ts';
export const name='sentiscope-product-host';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
export interface Config {
 dataDirectory:string;owner:ResearchOptions['owner'];port:number;model?:ResearchOptions['model'];intervalSeconds?:number;grants?:ResearchOptions['grants'];
 budgets?:Readonly<Record<string,BudgetConfig>>;modelEgress?:Readonly<Record<string,ModelEgressGrant>>;
 credentialGrants?:readonly Omit<CredentialGrant,'owner'>[];resourceDefaults?:HostDefaults;
 notificationDefaults?:BriefPreferences;auth?:LocalAuthConfig;syntheticTrial?:boolean;
}
/** Local synthetic routes are trusted in-process fixtures; no JSON flag grants external model transport. */
export async function startProductHost(ctx:Context,config:Config,engineering:{localModelRoutes?:readonly LocalModelRoute[]}={}) {
 if(!config||Object.keys(config).some(k=>!['dataDirectory','owner','port','model','intervalSeconds','grants','budgets','modelEgress','credentialGrants','resourceDefaults','notificationDefaults','auth','syntheticTrial'].includes(k)))throw new Error('Invalid Host configuration');
 if(!config.owner||typeof config.owner.enterpriseId!=='string'||!config.owner.enterpriseId.trim()||typeof config.owner.principalId!=='string'||!config.owner.principalId.trim()||Object.keys(config.owner).some(k=>!['enterpriseId','principalId'].includes(k)))throw new Error('Host owner is required');
 if(config.model&&(Object.keys(config.model).some(k=>!['provider','model','maxTokens'].includes(k))||typeof config.model.provider!=='string'||typeof config.model.model!=='string'))throw new Error('Use non-secret model references only');
 if(config.syntheticTrial!==undefined&&typeof config.syntheticTrial!=='boolean')throw new Error('Invalid synthetic trial flag');
 if(config.syntheticTrial&&(!config.model||config.model.provider!==SYNTHETIC_TRIAL_PROVIDER||config.model.model!=='synthetic'))throw new Error('Synthetic trial requires the fixed local synthetic model reference');
 if(!Number.isSafeInteger(config.port)||config.port<0||config.port>65535)throw new Error('Invalid local port');
 process.umask(0o077);const directory=resolve(config.dataDirectory);mkdirSync(directory,{recursive:true,mode:0o700});
 const store=new SentiStore({filename:resolve(directory,'business.sqlite')});
 let coordinator:ResearchCoordinator;let controls:HostControls;
 const native=createNativeResearchPort(ctx,{beforeWake:fact=>coordinator.beforeWake(fact),modelStream:(fact,request,next)=>controls.stream(fact,request,next)});
 const localModelRoutes=engineering.localModelRoutes??(config.syntheticTrial?[{provider:SYNTHETIC_TRIAL_PROVIDER,model:'synthetic'}]:undefined);
 const runtimeReady=()=>!config.model||ctx.llm.listProviders().some(provider=>provider.id===config.model!.provider);
 const defaults:HostDefaults|undefined=config.syntheticTrial?{...config.resourceDefaults,budget:config.resourceDefaults?.budget??{limits:{modelRequests:5000,outputTokens:1000000,computeMilliseconds:0},durationMs:3600000},modelEgress:config.resourceDefaults?.modelEgress??{enabled:true,provider:SYNTHETIC_TRIAL_PROVIDER,model:'synthetic',maxTokens:config.model?.maxTokens??128}}:config.resourceDefaults;
 controls=new HostControls({store,owner:config.owner,modelSelection:config.model,defaults,localModelRoutes,runtimeReady,
  credentialRecords:{readRecord:key=>ctx.credentials.readRecord(parseCredentialKey(key)),modifyRecord:(key,mutate)=>ctx.credentials.modifyRecord(parseCredentialKey(key),mutate)},
  isCurrent:b=>coordinator?.isCurrentBinding(b)??false,verifyInput:b=>coordinator.verifyModelInput(b),halt:(b,code)=>coordinator.haltForResources(b,code),changed:id=>coordinator?.changed(id)});
 const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 coordinator=new ResearchCoordinator({store,owner:config.owner,native,Engine,controls,model:config.model,intervalSeconds:config.intervalSeconds,grants:config.grants,sourceDefaults:defaults?.sources,runtimeReady,notificationDefaults:config.notificationDefaults,protectedDirectories:[resolve(project,'.local'),resolve(project,'runtime'),resolve(project,'.git'),directory]});
 let host:Awaited<ReturnType<typeof startLocalHost>>|undefined;
 try{
  host=await startLocalHost({store,owner:config.owner,port:config.port,controlPort:coordinator.controlPort,researchPort:coordinator,auth:config.auth,allowUnauthenticated:!config.auth&&Boolean(engineering.localModelRoutes?.length)});
  if(config.credentialGrants)controls.configureCredentials(config.credentialGrants.map(g=>({...g,owner:config.owner})));
  for(const [id,budget]of Object.entries(config.budgets??{}))controls.configureBudget(id,budget);
  for(const [id,egress]of Object.entries(config.modelEgress??{}))controls.configureModelEgress(id,egress);
  await coordinator.start();
 }catch(error){if(host)await host.close();await coordinator.close();controls.close();store.close();throw error;}
 const activeHost=host;let closing:Promise<void>|undefined;
 return {store,coordinator,controls,url:host.url,close(){return closing??=(async()=>{await activeHost.close();await coordinator.close();controls.close();store.close();})();}};
}
export async function apply(ctx:Context,config:Config) {
 const host=await startProductHost(ctx,config);process.stdout.write(`OptraSentiScope 经营者工作台：${host.url}\n${host.coordinator.status.message}\n`);ctx.effect(()=>()=>host.close());
}
