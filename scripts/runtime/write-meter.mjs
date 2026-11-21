import fsPromises from 'node:fs/promises';
import {appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';

const output=process.env.SENTISCOPE_WRITE_METER_PATH,root=process.env.SENTISCOPE_WRITE_METER_ROOT;
if(!output||!root)throw new Error('WRITE_METER_CONFIGURATION_REQUIRED');
mkdirSync(dirname(output),{recursive:true});appendFileSync(output,JSON.stringify({at:new Date().toISOString(),path:'startup',flags:'startup',bytes:0,success:true})+'\n');
const originalOpen=fsPromises.open;
fsPromises.open=async function(path,...rest){
 const handle=await originalOpen.call(this,path,...rest),originalWrite=handle.writeFile;
 handle.writeFile=async function(data,options){
  const bytes=Buffer.isBuffer(data)?data.length:ArrayBuffer.isView(data)?data.byteLength:Buffer.byteLength(String(data),typeof options==='string'?options:options?.encoding??'utf8');
  try{const result=await originalWrite.call(this,data,options);if(resolve(String(path)).startsWith(resolve(root)))appendFileSync(output,JSON.stringify({at:new Date().toISOString(),path:String(path),flags:rest[0],bytes,success:true})+'\n');return result;}
  catch(error){if(resolve(String(path)).startsWith(resolve(root)))appendFileSync(output,JSON.stringify({at:new Date().toISOString(),path:String(path),flags:rest[0],attemptedBytes:bytes,success:false,error:error?.code??'WRITE_FAILED'})+'\n');throw error;}
 };
 return handle;
};
syncBuiltinESMExports();
