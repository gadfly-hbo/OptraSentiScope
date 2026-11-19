import {cpSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {StoreError} from './domain.ts';

export interface RuntimeBackupManifest {kind:'runtime-backup-v1';createdAt:string;sourceDataDirectory:string;files:readonly {path:string;sha256:string;bytes:number}[];}
const digest=async(path:string)=>await new Promise<string>((resolveDigest,reject)=>{const hash=createHash('sha256');createReadStream(path).on('data',chunk=>hash.update(chunk)).on('end',()=>resolveDigest(hash.digest('hex'))).on('error',reject);});
function files(directory:string):string[]{
  const output:string[]=[];
  const visit=(current:string)=>{for(const entry of readdirSync(current,{withFileTypes:true})){if(entry.name.endsWith('.lock'))continue;const path=join(current,entry.name);if(entry.isDirectory())visit(path);else if(entry.isFile())output.push(path);}};
  visit(directory);return output;
}
function requireClosed(dataDirectory:string){const database=resolve(dataDirectory,'business.sqlite');if(!statSync(database,{throwIfNoEntry:false})?.isFile())throw new StoreError('runtime_backup_invalid','运行目录缺少业务数据库。');}
export async function createRuntimeBackup(dataDirectory:string,outputDirectory:string):Promise<RuntimeBackupManifest>{
 const source=resolve(dataDirectory),target=resolve(outputDirectory);requireClosed(source);
 if(statSync(target,{throwIfNoEntry:false}))throw new StoreError('runtime_backup_exists','备份目录已存在，不能覆盖。',409);
 mkdirSync(target,{recursive:true,mode:0o700});
  const databaseTarget=join(target,'business.sqlite').replaceAll(`'`, `''`);const database=new DatabaseSync(join(source,'business.sqlite'),{readOnly:true});try{database.exec(`VACUUM INTO '${databaseTarget}'`);}finally{database.close();}
 const native=join(source,'native');if(statSync(native,{throwIfNoEntry:false}))cpSync(native,join(target,'native'),{recursive:true,filter:sourcePath=>!sourcePath.endsWith('.lock')});
  const paths=files(target).sort();const entries:{path:string;sha256:string;bytes:number}[]=[];
 for(const path of paths)entries.push({path:relative(target,path),sha256:await digest(path),bytes:statSync(path).size});
 const manifest:RuntimeBackupManifest={kind:'runtime-backup-v1',createdAt:new Date().toISOString(),sourceDataDirectory:source,files:entries};writeFileSync(join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});return manifest;
}
export async function verifyRuntimeBackup(directory:string):Promise<{status:'ok'|'invalid';files:number;failures?:readonly string[]}>{
 const root=resolve(directory);let manifest:RuntimeBackupManifest;try{manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));}catch{throw new StoreError('runtime_backup_invalid','备份清单缺失或无效。');}
 if(manifest.kind!=='runtime-backup-v1')throw new StoreError('runtime_backup_invalid','未知备份清单版本。');
 const failures:string[]=[];
 for(const file of manifest.files){const path=join(root,file.path);try{if(statSync(path).size!==file.bytes||await digest(path)!==file.sha256)failures.push(file.path);}catch{failures.push(file.path);}}
 return failures.length?{status:'invalid',files:manifest.files.length,failures}:{status:'ok',files:manifest.files.length};
}
export async function restoreRuntimeBackup(backupDirectory:string,targetDataDirectory:string):Promise<void>{
 const source=resolve(backupDirectory),target=resolve(targetDataDirectory);const verification=await verifyRuntimeBackup(source);if(verification.status!=='ok')throw new StoreError('runtime_backup_invalid','备份校验失败，不能恢复。',409);
 if(statSync(target,{throwIfNoEntry:false}))throw new StoreError('runtime_restore_exists','恢复目标已存在，不能覆盖。',409);
 mkdirSync(target,{recursive:true,mode:0o700});cpSync(source,target,{recursive:true,filter:path=>path!==join(source,'manifest.json')});
}
