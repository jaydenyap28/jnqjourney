// Shared verbatim identity projection from the verified Registry Worker.
export function mediaIdentity(key,object,receipt) {
  if(!object||!receipt||!Number.isSafeInteger(object.size)||object.size<12||object.size>10*1024*1024||
    !Number.isSafeInteger(receipt.size)||receipt.size<1||receipt.size>1024||receipt.httpMetadata?.contentType!=='application/json'||
    !['image/png','image/jpeg','image/webp','image/gif'].includes(object.httpMetadata?.contentType)||
    ![object.etag,object.version,receipt.etag,receipt.version].every(value=>typeof value==='string'&&value.length>0))return null
  return {key,size:object.size,mime:object.httpMetadata.contentType,etag:object.etag,version:object.version,
    receipt_size:receipt.size,receipt_etag:receipt.etag,receipt_version:receipt.version}
}
