// Generate exact-size, structurally valid RGB PNGs locally. Original user
// photos are never transformed. PNG compression/CRC work runs only on this PC.
import {deflateSync} from 'node:zlib'
import {writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const table=Array.from({length:256},(_,i)=>{let c=i;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,8+data.length)),8+data.length);return out}
export function makePng(target,seed=1){
  const width=1024,height=Math.floor((target-2048)/(width*3+1)),raw=Buffer.alloc((width*3+1)*height)
  let state=seed>>>0
  for(let y=0;y<height;y++){const start=y*(width*3+1);raw[start]=0;for(let i=1;i<=width*3;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;raw[start+i]=state>>>24}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2
  const parts=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:0}))]
  const used=parts.reduce((n,b)=>n+b.length,0)+12
  const padding=target-used-12
  if(padding<8)throw new Error('PNG_PADDING_TOO_SHORT')
  const text=Buffer.alloc(padding,65);Buffer.from('Fixture\0').copy(text)
  parts.push(chunk('tEXt',text),chunk('IEND',Buffer.alloc(0)))
  const bytes=Buffer.concat(parts);if(bytes.length!==target)throw new Error('PNG_SIZE_MISMATCH')
  return{bytes,width,height,sha256:createHash('sha256').update(bytes).digest('hex')}
}
export async function writeImages(){
  await mkdir('artifacts/cloudflare-upload-fix/images',{recursive:true})
  const records=[]
  for(const [mib,seed,name]of [[1,1,'1mib'],[5,5,'5mib'],[10,10,'10mib'],[10,99,'10mib-independent']]){
    const image=makePng(mib*1024*1024,seed),file=`artifacts/cloudflare-upload-fix/images/${name}.png`
    await writeFile(file,image.bytes);records.push({file,bytes:image.bytes.length,width:image.width,height:image.height,sha256:image.sha256})
  }
  await writeFile('artifacts/cloudflare-upload-fix/images.json',JSON.stringify(records,null,2))
  return records
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/upload-fix-images.mjs'))console.log(JSON.stringify(await writeImages(),null,2))
