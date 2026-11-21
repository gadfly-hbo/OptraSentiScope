import type {Context} from '@deepseek-ai/cordis';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import type {GenerateOptions,StreamChunk} from '@deepseek-ai/dsh-llm';
import {randomUUID} from 'node:crypto';
export const name='sentiscope-synthetic-trial-provider';
export const inject=['llm'];
export const SYNTHETIC_TRIAL_PROVIDER='sentiscope-synthetic-trial';
export interface Config {provider?:string}
type LooseMessage={role?:string;content?:readonly {type:string;text?:string}[]};
const text=(m:LooseMessage)=>m.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
function toolValue(m:LooseMessage|undefined){try{return JSON.parse(text(m??{}));}catch{return{};}}
class SyntheticTrialAdapter extends LlmAdapter{
 assessments=new Map<string,number>();noted=new Set<string>();decided=new Set<string>();intake=new Set<string>();independent=new Set<string>();
 async *stream(options:GenerateOptions):AsyncIterable<StreamChunk>{
  const messages=options.messages as readonly LooseMessage[];
  const users=messages.filter(m=>m.role==='user'),u=text(users.at(-1)??{}),last=messages.at(-1),data=last?.role==='tool'?toolValue(last):{};
  let call:[string,Record<string,unknown>]|undefined;const worker=users.some(m=>text(m).includes('SENTISCOPE_WORKER'));
  if(worker&&(u.includes('SENTISCOPE_INPUTS')||u.includes('SENTISCOPE_WORKER'))){
   if(last?.role!=='tool')call=['list_sources',{}];
   else if(data.references?.length){const ref=data.references.at(-1);call=['read_source',{ref:ref.ref,hash:ref.hash}];}
   else if(data.record)call=['report_research',{state:'progress',summary:`Synthetic trial report: ${data.text}`,evidence:[{ref:data.record.ref,hash:data.record.hash}]}];
   else if(data.references)call=['report_research',{state:'waiting',summary:'No currently authorized synthetic evidence.',evidence:[]}];
  }else if(!worker&&u.includes('SENTISCOPE_ASSESS')){
   const c=JSON.parse(u.split('\n')[1]),evalId=c.evalId,delegationId=c.triggers[0].meta.delegationId;
   if(!this.decided.has(evalId)){
    const stage=this.assessments.get(evalId)??0;
    if(stage===0){call=['research_context',{}];this.assessments.set(evalId,1);}
    else if(stage===1&&!this.intake.has(delegationId)){
     call=['save_intake_summary',{requestId:`intake-${delegationId}`,expectedRevision:data.intake?.summary?.revision??0,reason:'Synthetic trial Agent consolidated the goal and exposed only a localized evaluation gap.',content:{objective:data.goal,facts:['Host exposes authorized synthetic source metadata; source bodies are read through exact authorized references.'],assumptions:['Synthetic engineering transport only; no business fact is inferred.'],reusableExperiences:[],researchAuthorization:['Read only the Host-granted synthetic directory.'],businessBoundary:['No operating action, external send or computation.'],evaluation:['Evaluation waits for the synthetic target; independent source research continues.'],followUp:['Supplement existing research and open a separate question only when the source event warrants it.'],unknowns:['Synthetic evaluation target is not supplied.'],questions:[{id:'evaluation-target',question:'Which synthetic evaluation target applies?',impact:'Only the evaluation direction waits.',blockingScopes:['evaluation'],status:'pending'}]}}];
     this.intake.add(delegationId);this.assessments.set(evalId,2);
    }else{
     this.assessments.set(evalId,2);const existing=c.tickets.find((t:{ended?:boolean})=>!t.ended);
     if(existing&&!this.noted.has(evalId)){call=['note_ticket',{ticketId:existing.id,text:'Synthetic source event supplements the existing research ticket. '}];this.noted.add(evalId);}
     else{
      const separate=c.triggers.some((trigger:{meta?:{kind?:string}})=>trigger.meta?.kind==='updated')&&!this.independent.has(delegationId);
      call=['decide_event',{triggerId:c.triggers[0].id,evalId,kind:existing&&!separate?'ignore':'accept',reason:separate?'The same update also exposes an independent synthetic question.':'Synthetic event is routed without duplicate research.',title:separate?'Independent source question':'Shared source baseline',scope:separate?'independent-question':'shared-source-baseline'}];
      if(separate)this.independent.add(delegationId);this.decided.add(evalId);
     }
    }
   }
  }else if(!worker&&u.includes('SENTISCOPE_CONTINUE')){
   if(last?.role!=='tool')call=['research_context',{}];
   else if(data.tickets?.find((t:{ended?:boolean})=>!t.ended))call=['note_ticket',{ticketId:data.tickets.find((t:{ended?:boolean})=>!t.ended).id,text:'Synthetic scheduled continuation checks currently authorized evidence. '}];
  }
  if(call){yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block:{type:'tool-call',id:ToolCallId(randomUUID()),name:call[0],arguments:JSON.stringify(call[1])}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};}
  else{yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic trial turn; not research quality evidence.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};}
 }
}
export function apply(ctx:Context,config:Config={}){
 const provider=config.provider??SYNTHETIC_TRIAL_PROVIDER;
 if(provider!==SYNTHETIC_TRIAL_PROVIDER)throw new Error('SYNTHETIC_TRIAL_PROVIDER_FIXED');
 ctx.llm.registerAdapter([provider],new SyntheticTrialAdapter());
}