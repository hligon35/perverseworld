// Wrangler invokes this even when Workers Builds uses its default deploy command.
// Keep automatic releases blocked until the production configuration is reviewed.
if(process.env.WORKERS_CI==='1'){
  await import('./verify-deploy.mjs');
  if(process.exitCode)process.exit(process.exitCode);
}
await import('./build.mjs');
