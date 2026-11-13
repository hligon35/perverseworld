// Bound streamed bodies before decoding so malformed or oversized requests cannot exhaust Worker memory.
export async function readLimited(stream,limit){
 const reader=stream?.getReader();if(!reader)return new Uint8Array();
 const parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('Payload too large');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
