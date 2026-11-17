import {prepare} from './prepare.mjs';
// CI installs only the already approved exact lock/source. Local checks never silently fetch missing dependencies.
const result=await prepare({installMissing:process.env.CI==='true'});
console.log(`${result.status}: ${result.output}`);
if(result.status!=='PASS')process.exitCode=1;
