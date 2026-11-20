import{readdirSync,readFileSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
function check(text,path){
 const imports=[...text.matchAll(/\b(?:from\s*|import\s*\(|import\s*)(['"])([^'"\n]+)\1/g)].map(m=>m[2]);
 for(const specifier of imports){
  if((specifier.startsWith('@deepseek-ai/')&&specifier.split('/').length!==2)||specifier.startsWith('dsh-superagent/')||/node_modules|official-sdk|^file:/.test(specifier))throw new Error(`Non-public SDK import: ${path}`);
  
 }
 for(const match of text.matchAll(/\b(import|export)\s+(type\s+)?[^;\n]*?\bfrom\s*(['"])(@deepseek-ai\/[^'"]+|dsh-superagent)\3/g))if(!path.startsWith('runtime/')&&!match[2])throw new Error(`SDK runtime import outside owned runtime: ${path}`);
 if(/\b(?:eval|Function)\s*\(/.test(text))throw new Error(`Runtime code evaluation forbidden: ${path}`);
}
// The guard itself must detect controlled bypass examples.
for(const text of ["import x from '@deepseek-ai/dsh-agent/lib/index.js'","import x from 'dsh-superagent/src/core/engine.ts'","import x from '../.local/official-sdk/superagent/lib/index.js'"]){let denied=false;try{check(text,'runtime/controlled-fixture.ts');}catch{denied=true;}if(!denied)throw new Error('Boundary guard failed its negative control');}
let count=0;
function files(dir){return readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name==='locks'?[]:e.isDirectory()?files(`${dir}/${e.name}`):e.isFile()&&e.name.endsWith('.ts')?[`${dir}/${e.name}`]:[]);}
for(const dir of ['src','runtime'])for(const path of files(dir)){check(readFileSync(resolve(root,path),'utf8'),path);count++;}
console.log(`PASS: ${count} product files, public SDK roots only; 3 bypass controls rejected`);
