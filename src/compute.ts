import type {RunBinding} from '../runtime/index.ts';
import {StoreError} from './domain.ts';
export interface ComputeRequest {readonly command:readonly string[];readonly timeoutMs:number;readonly inputRefs:readonly {readonly ref:string;readonly hash:string}[];}
export interface ComputeStatus {readonly status:'unavailable';readonly reason:'isolation_unconfigured';}
export interface ComputeResult extends ComputeStatus {readonly code:'compute_unavailable';readonly dispatched:false;}
export interface ComputeCancellation {readonly status:'not_dispatched';readonly reason:'isolation_unconfigured';readonly resourcesDispatched:0;}
export interface ComputePort {
  status(binding:RunBinding):ComputeStatus;
  run(binding:RunBinding,request:unknown):Promise<ComputeResult>;
  cancel(binding:RunBinding):Promise<ComputeCancellation>;
}
function validateRequest(request:unknown):void {
  const invalid=()=>{throw new StoreError('invalid_compute_request','计算请求字段或资源参数无效。');};
  if(!request||typeof request!=='object'||Array.isArray(request))return invalid();
  const value=request as Record<string,unknown>;
  const keys=Object.keys(value);
  if(keys.length!==3||keys.some(key=>!['command','timeoutMs','inputRefs'].includes(key)))return invalid();
  if(!Array.isArray(value.command)||value.command.length===0||value.command.some(part=>typeof part!=='string'||part.length===0||part.includes('\0')))return invalid();
  if(!Number.isSafeInteger(value.timeoutMs)||(value.timeoutMs as number)<1||(value.timeoutMs as number)>2147483647)return invalid();
  if(!Array.isArray(value.inputRefs))return invalid();
  for(const reference of value.inputRefs) {
    if(!reference||typeof reference!=='object'||Array.isArray(reference))return invalid();
    const item=reference as Record<string,unknown>;const fields=Object.keys(item);
    if(fields.length!==2||fields.some(key=>!['ref','hash'].includes(key))||typeof item.ref!=='string'||!item.ref||item.ref.includes('\0')||typeof item.hash!=='string'||!/^[a-f0-9]{64}$/.test(item.hash))return invalid();
  }
}
/** No configured isolated world; this port owns no execution resource and never falls back to the Host. */
export function createClosedComputePort(options:{admit:(binding:RunBinding)=>boolean}):ComputePort {
  const requireCurrent=(binding:RunBinding):void=>{
    let admitted=false;try{admitted=options.admit(binding)===true;}catch{}
    if(!admitted)throw new StoreError('stale_compute_binding','当前研究资格不具备，未派发计算。',409);
  };
  return {
    status(binding){requireCurrent(binding);return {status:'unavailable',reason:'isolation_unconfigured'};},
    async run(binding,request){requireCurrent(binding);validateRequest(request);return {status:'unavailable',code:'compute_unavailable',reason:'isolation_unconfigured',dispatched:false};},
    async cancel(binding){requireCurrent(binding);return {status:'not_dispatched',reason:'isolation_unconfigured',resourcesDispatched:0};},
  };
}
