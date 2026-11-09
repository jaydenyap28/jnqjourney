const encode=value=>new TextEncoder().encode(value)
export const BRIDGE_PATH='/internal/r2-identity'
export async function bridgeMacInput(url,body,timestamp,nonce,marker){
  const target=new URL(url)
  const digest=await crypto.subtle.digest('SHA-256',encode(body))
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  return encode(['jnq-r2-identity-v1','rnamstwwbzknwbjwdgrf','POST',target.host,target.pathname,timestamp,nonce,marker,hex].join('\n'))
}
export async function bridgeKey(secret,usages){
  return crypto.subtle.importKey('raw',encode(secret),{name:'HMAC',hash:'SHA-256'},false,usages)
}
export async function signBridge(secret,url,body,marker,{timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID()}={}){
  const key=await bridgeKey(secret,['sign'])
  const signature=await crypto.subtle.sign('HMAC',key,await bridgeMacInput(url,body,timestamp,nonce,marker))
  return {'Content-Type':'application/json','X-JnQ-Bridge-Time':timestamp,'X-JnQ-Bridge-Nonce':nonce,
    'X-JnQ-Acceptance':marker,'X-JnQ-Bridge-Signature':Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('')}
}
