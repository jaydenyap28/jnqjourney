const $=selector=>document.querySelector(selector)
let row,uploadedImage,refreshTimer
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
  row=result.spot;uploadedImage=undefined
  for(const key of ['name','name_cn','description','experience_zh','publication_status'])$('#save').elements[key].value=row[key]??(key==='publication_status'?'published':'')
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
  const file=$('#photo').files[0]
  if(!file){status('请选择照片');return}
  if(file.size>10*1024*1024){status('照片不能超过 10 MiB');return}
  try {
    const result=await api(`/api/candidate/spots/${row.id}/image`,{method:'POST',headers:{'Content-Type':file.type},body:file})
    uploadedImage=result.url;$('#image').src=result.url;$('#image').hidden=false
    $('#photo-state').textContent='已上传到测试 R2。保存 Spot 后更新公开页面。'
  }catch(error){status(error.message)}
})
$('#save').addEventListener('submit',async event=>{
  event.preventDefault()
  const fields=Object.fromEntries(new FormData(event.currentTarget))
  if(uploadedImage){fields.image_url=uploadedImage;fields.images=[...new Set([...(row.images||[]),uploadedImage])]}
  try {
    const result=await api(`/api/candidate/spots/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedUpdatedAt:row.updated_at,data:fields})})
    row=result.spot;uploadedImage=undefined
    status(result.publication==='withdrawn'?'已下架。新的公开请求立即返回 404。':`保存成功，公开页面已更新。版本 ${row.updated_at}；未触发整站构建。`)
  }catch(error){status(error.message)}
})
$('#logout').addEventListener('click',async()=>{
  try {await api('/api/candidate/session',{method:'DELETE'});clearInterval(refreshTimer);row=undefined;$('#editor').hidden=true;$('#login').hidden=false;status('已退出登录')}catch(error){status(error.message)}
})
api('/api/candidate/session').then(result=>enter(result.fixtures)).catch(()=>{})
