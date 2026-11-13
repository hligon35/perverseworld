/* Shared public enhancements; browsing and form submissions do not depend on these. */
(() => {
 const updateYear=()=>document.querySelectorAll('[data-current-year]').forEach(node=>{const year=String(new Date().getFullYear());if(node.textContent!==year)node.textContent=year;});
 updateYear();document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateYear();});
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
})();
