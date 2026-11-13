// Single source for the store origin shared by the storefront and admin screens.
const configured=process.env.EXPO_PUBLIC_SITE_URL||'https://perverseworld.com';
function storeOrigin(){try{const url=new URL(configured);if(url.protocol==='https:'||(__DEV__&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return url.origin;}catch{}return 'https://perverseworld.com';}
export const ROOT=storeOrigin();
