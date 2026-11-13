import sharp from 'sharp';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
export async function buildIcons(root){
 const source=await readFile(new URL('public/assets/images/perverseIcon.png',root));
 await mkdir(new URL('dist/assets/icons/',root),{recursive:true});
 for(const [name,size] of [['favicon-32',32],['apple-touch-icon',180],['icon-192',192],['icon-512',512]]){
  const bytes=await sharp(source).resize(size,size,{fit:'contain',background:{r:17,g:18,b:16,alpha:1}}).png({compressionLevel:9}).toBuffer();await writeFile(new URL('dist/assets/icons/'+name+'.png',root),bytes);
 }
 // Maskable variant keeps the artwork inside the safe zone so Android's adaptive masks don't crop it.
 const bg={r:17,g:18,b:16,alpha:1},inner=await sharp(source).resize(410,410,{fit:'contain',background:bg}).png().toBuffer();
 await writeFile(new URL('dist/assets/icons/icon-maskable-512.png',root),await sharp({create:{width:512,height:512,channels:4,background:bg}}).composite([{input:inner,gravity:'centre'}]).png({compressionLevel:9}).toBuffer());
}
