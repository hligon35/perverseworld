// One route table drives generation and links; every URL has its own HTML document.
export const routes = [
  {path:'/', page:'home', title:'Perverse World — Wear the Chaos', description:'Independent streetwear shaped by a world of contrasts: innocence, conflict, hidden struggles and human connection.'},
  {path:'/shop', page:'shop', title:'Shop All — Perverse World', description:'Shop graphic tees, hoodies and sets from Perverse World.', index:'01 / THE SHOP', heading:'ALL PIECES. ZERO RULES.', copy:'Every statement starts somewhere. Explore the entire Perverse World lineup.'},
  {path:'/contact', page:'contact', title:'Contact — Perverse World', description:'Questions about the brand, orders or collaborations? Contact Perverse World.', index:'02 / STAY CONNECTED', heading:'MAKE CONTACT.', copy:'Questions about drops, sizing, or collaborations? Send us a message.'}
];

// Keep bookmarks to the previous structure useful without retaining extra pages.
export const legacyRedirects = {
  '/about':'/#story',
  '/collections':'/shop',
  '/collections/tees':'/shop',
  '/collections/hoodies':'/shop',
  '/collections/sets':'/shop'
};
