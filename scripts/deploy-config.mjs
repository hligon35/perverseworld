// Keep the acknowledgement separate from secrets and expose no configuration values in logs.
export function deploymentBlockers(config, env) {
  const blockers=[];
  if(config.includes('REPLACE_'))blockers.push('Replace the D1 ID and Cloudflare Access issuer/application audience placeholders.');
  for(const name of ['TURNSTILE_SITE_KEY','ADMIN_ALLOWED_EMAILS']){
    if(!new RegExp(`^${name}\\s*=\\s*"[^"\\s]+"`,'m').test(config))blockers.push(`Configure ${name} in wrangler.toml or revise this guard to read the reviewed production configuration.`);
  }
  const vars=config.match(/^\[vars\]\s*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1]||'';
  const configured=vars.match(/^CLOUDFLARE_CONFIGURATION_VERIFIED\s*=\s*["']([^"']*)["']\s*(?:#.*)?$/m)?.[1];
  // An explicitly supplied environment value (including false/empty) overrides the file.
  const acknowledgement=env.CLOUDFLARE_CONFIGURATION_VERIFIED ?? configured;
  if(String(acknowledgement??'').trim().toLowerCase()!=='true'){
    blockers.push('Production configuration verification has not been acknowledged. After verifying D1 migrations, Access, Turnstile, email, domains and the official repository connection, set CLOUDFLARE_CONFIGURATION_VERIFIED=true in Cloudflare Settings > Build > Build variables and secrets, local .env, or [vars] in wrangler.toml. Build-environment values override file values; runtime dashboard variables alone do not reach this script.');
  }
  return blockers;
}
