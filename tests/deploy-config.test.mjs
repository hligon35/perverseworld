import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentBlockers} from '../scripts/deploy-config.mjs';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const config='[vars]\nTURNSTILE_SITE_KEY = "public"\nADMIN_ALLOWED_EMAILS = "owner@example.com"\n';
test('accepts explicit build acknowledgement or the tracked Wrangler acknowledgement',()=>{
  assert.deepEqual(deploymentBlockers(config,{CLOUDFLARE_CONFIGURATION_VERIFIED:'true'}),[]);
  assert.deepEqual(deploymentBlockers(config+'CLOUDFLARE_CONFIGURATION_VERIFIED = "true"\n',{}),[]);
  assert.deepEqual(deploymentBlockers(config+"CLOUDFLARE_CONFIGURATION_VERIFIED = 'true' # reviewed\n",{}),[]);
});
test('explicit build environment overrides Wrangler; missing acknowledgement fails closed',()=>{
  const acknowledged=config+'CLOUDFLARE_CONFIGURATION_VERIFIED = "true"\n';
  for(const value of ['false','', 'yes'])assert.equal(deploymentBlockers(acknowledged,{CLOUDFLARE_CONFIGURATION_VERIFIED:value}).length,1);
  assert.equal(deploymentBlockers(config,{}).length,1);
  assert.equal(deploymentBlockers(config+'[other]\nCLOUDFLARE_CONFIGURATION_VERIFIED = "true"\n',{}).length,1);
});
test('acknowledgement does not bypass incomplete configuration checks',()=>{
  assert.ok(deploymentBlockers('[vars]\nDB_ID="REPLACE_WITH_ID"\n',{CLOUDFLARE_CONFIGURATION_VERIFIED:'true'}).length>=3);
});
test('standalone guard loads local .env and preserves an explicit process override',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pw-deploy-config-'));
  try{
    await mkdir(join(directory,'scripts'));
    for(const name of ['verify-deploy.mjs','deploy-config.mjs'])await copyFile(new URL('../scripts/'+name,import.meta.url),join(directory,'scripts',name));
    await writeFile(join(directory,'wrangler.toml'),config);
    await writeFile(join(directory,'.env'),'CLOUDFLARE_CONFIGURATION_VERIFIED=true\n');
    const env={...process.env};delete env.CLOUDFLARE_CONFIGURATION_VERIFIED;
    const run=overrides=>spawnSync(process.execPath,[join(directory,'scripts','verify-deploy.mjs')],{env:{...env,...overrides},encoding:'utf8'});
    const loaded=run({});assert.equal(loaded.status,0,loaded.stderr);assert.match(loaded.stdout,/checks passed/);
    const denied=run({CLOUDFLARE_CONFIGURATION_VERIFIED:'false'});assert.equal(denied.status,1);assert.match(denied.stderr,/Deployment blocked/);
  }finally{
    if(dirname(directory)!==tmpdir())throw Error('Unexpected test cleanup path');
    await rm(directory,{recursive:true,force:true});
  }
});
