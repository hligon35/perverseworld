import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
const blockers=[];
if(config.includes('REPLACE_'))blockers.push('Replace the D1 ID and Cloudflare Access issuer/application audience placeholders.');
for(const name of ['TURNSTILE_SITE_KEY','ADMIN_ALLOWED_EMAILS']){
  if(!new RegExp(`^${name}\\s*=\\s*"[^"\\s]+"`,'m').test(config))blockers.push(`Configure ${name} in wrangler.toml or revise this guard to read the reviewed production configuration.`);
}
if(process.env.CLOUDFLARE_CONFIGURATION_VERIFIED!=='true')blockers.push('Verify remote D1 migrations, Access policies/JWT audience and allowlist, Turnstile widget/secret and hostnames, Resend secret/verified sender, inbound mail routing, custom domains, and the official repository connection. Then explicitly set CLOUDFLARE_CONFIGURATION_VERIFIED=true for deployment.');
if(blockers.length){console.error('Deployment blocked:\n'+blockers.map(x=>'- '+x).join('\n'));process.exitCode=1;}
else console.log('Local configuration checks passed; remote verification acknowledged.');
