const $=selector=>document.querySelector(selector)
let row,uploadedImages=[],refreshTimer
const basicFields=['name','name_cn','description','experience_zh','publication_status']
const advancedFields=['category','latitude','longitude','region_id','review','review_jayden','review_qing','address','google_maps_url','opening_hours','price_info','tags','visit_date','is_visited','image_url','images','image_metadata','video_url','facebook_video_url','related_note_slugs','status','seo_title_zh','seo_description_zh','seo_title_en','seo_description_en','experience_en','redirect_url','redirect_type']
function status(text){$('#status').textContent=text}
async function api(path,options={}) {
  const response=await fetch(path,{...options,credentials:'same-origin'})
  const body=await response.json()
  if(!response.ok)throw new Error(body.error||`请求失败 (${response.status})`)
  return body
}
async function refresh() {
  try {await api('/api/candidate/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh:true})})}
  catch {clearInterval(refreshTimer);status('会话已到期，请重新登录。')}
}
async function load() {
  const result=await api(`/api/candidate/spots/${$('#fixture').value}`)
  row=result.spot;uploadedImages=[]
  for(const key of basicFields)$('#save').elements[key].value=row[key]??''
  $('#advanced-fields').value=JSON.stringify(Object.fromEntries(advancedFields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])),null,2)
  $('#public').href=result.publicPath
  $('#image').hidden=!row.image_url
  if(row.image_url)$('#image').src=row.image_url
  $('#photo-state').textContent=''
  status(`已读取版本 ${row.updated_at}`)
}
async function enter(fixtures) {
  $('#fixture').replaceChildren(...Object.entries(fixtures).map(([id,slug])=>new Option(slug,id)))
  $('#login').hidden=true;$('#editor').hidden=false
  clearInterval(refreshTimer);refreshTimer=setInterval(refresh,40*60*1000)
  await load()
}
$('#login').addEventListener('submit',async event=>{
  event.preventDefault()
  const form=event.currentTarget
  const credentials={email:form.elements.email.value,password:form.elements.password.value}
  form.elements.password.value=''
  try {const result=await api('/api/candidate/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});await enter(result.fixtures)}catch(error){status(error.message)}
})
$('#reload').addEventListener('click',()=>load().catch(error=>status(error.message)))
$('#fixture').addEventListener('change',()=>load().catch(error=>status(error.message)))
$('#upload').addEventListener('click',async()=>{
  const files=[...$('#photo').files]
  if(!files.length){status('请选择照片');return}
  if(files.some(file=>file.size>10*1024*1024)){status('照片不能超过 10 MiB');return}
  if(new Set([...(row.images||[]),...uploadedImages]).size+files.length>60){status('相册最多 60 张照片');return}
  const fixtureId=row.id
  $('#upload').disabled=true
  let ticket
  try {
    const base=`/api/candidate/spots/${fixtureId}/image`
    for(const file of files){
      ticket=await api(`${base}/presign`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:file.size,type:file.type})})
      const upload=await fetch(ticket.putUrl,{method:'PUT',headers:ticket.headers,body:file,credentials:'omit',redirect:'error'})
      if(!upload.ok)throw new Error('照片上传失败，请重试。')
      const result=await api(`${base}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:ticket.key})})
      ticket=undefined
      if(row.id!==fixtureId)throw new Error('景点已切换，请重新读取。')
      uploadedImages.push(result.url);$('#image').src=result.url;$('#image').hidden=false
      $('#photo-state').textContent=`已上传到测试 R2，共 ${uploadedImages.length} 张。保存 Spot 后更新公开页面。`
    }
  }catch(error){if(ticket)await api(`/api/candidate/spots/${fixtureId}/image/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:ticket.key})}).catch(()=>{});status(error.message)}
  finally{$('#upload').disabled=false}
})
$('#save').addEventListener('submit',async event=>{
  event.preventDefault()
  if($('#upload').disabled){status('请等待上传完成。');return}
  try {
    const fields=JSON.parse($('#advanced-fields').value)
    if(!fields||Array.isArray(fields)||typeof fields!=='object'||Object.keys(fields).some(key=>!advancedFields.includes(key)))throw new Error('请检查完整字段 JSON。')
    Object.assign(fields,Object.fromEntries(new FormData(event.currentTarget)))
    if(fields.publication_status==='')fields.publication_status=null
    if(uploadedImages.length){fields.image_url=uploadedImages.at(-1);fields.images=[...new Set([...(fields.images||[]),...uploadedImages])]}
    const result=await api(`/api/candidate/spots/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUpdatedAt:row.updated_at,data:fields})})
    row=result.spot;uploadedImages=[]
    $('#advanced-fields').value=JSON.stringify(Object.fromEntries(advancedFields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])),null,2)
    status(result.publication==='withdrawn'?'已下架。新的公开请求立即返回 404。':`保存成功，公开页面已更新。版本 ${row.updated_at}；未触发整站构建。`)
  }catch(error){status(error.message)}
})
$('#logout').addEventListener('click',async()=>{
  try {await api('/api/candidate/session',{method:'DELETE'});clearInterval(refreshTimer);row=undefined;$('#editor').hidden=true;$('#login').hidden=false;status('已退出登录')}catch(error){status(error.message)}
})
api('/api/candidate/session').then(result=>enter(result.fixtures)).catch(()=>{})
