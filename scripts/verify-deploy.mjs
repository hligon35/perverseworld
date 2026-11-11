import {readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {deploymentBlockers} from './deploy-config.mjs';
// Node scripts do not automatically load .env; existing process variables keep precedence.
try{loadEnvFile(new URL('../.env',import.meta.url));}catch(error){
  if(error.code!=='ENOENT')throw error;
}
const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
const blockers=deploymentBlockers(config,process.env);
if(blockers.length){console.error('Deployment blocked:\n'+blockers.map(x=>'- '+x).join('\n'));process.exitCode=1;}
else console.log('Local configuration checks passed; remote verification acknowledged.');
