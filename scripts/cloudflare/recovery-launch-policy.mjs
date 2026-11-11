// Local review/build policy only. No network, deployment, credentials or ACLs.
export const RECOVERY_CANONICAL_ORIGIN='https://www.jnqjourney.com'
export function normalizeRecoveryCanonical(value) {
  if(!value)return value
  let url
  try{url=new URL(value)}catch{return value}
  if(!['https:','http:'].includes(url.protocol)||!['jnqjourney.com','www.jnqjourney.com'].includes(url.hostname))return value
  const origin=new URL(RECOVERY_CANONICAL_ORIGIN)
  url.protocol=origin.protocol;url.hostname=origin.hostname;url.port=''
  return url.href
}

export function staticRecoveryIndexingPolicy(mode='preview') {
  if(!['preview','production-review'].includes(mode))throw Error('PRODUCTION_DEPLOYMENT_NOT_ENABLED')
  const preview=mode==='preview'
  return {mode,deployable:preview,functions:0,adsEnabled:false,
    headers:'/*\n'+(preview?'  X-Robots-Tag: noindex, nofollow\n':'')+
      '  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-JnQ-Hosting: '+(preview?'static-recovery-preview':'production-review-only')+'\n'+
      '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n'+
      (preview?'':'/public-data/*\n  X-Robots-Tag: noindex, nofollow\n/_next/data/*\n  X-Robots-Tag: noindex, nofollow\n/api/*\n  X-Robots-Tag: noindex, nofollow\n/*.txt\n  X-Robots-Tag: noindex, nofollow\n'),
    robots:preview?'User-agent: *\nDisallow: /\n':`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${RECOVERY_CANONICAL_ORIGIN}/sitemap.xml\nHost: ${RECOVERY_CANONICAL_ORIGIN}\n`,
  }
}
