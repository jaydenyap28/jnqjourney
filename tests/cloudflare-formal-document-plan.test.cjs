const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const Module=require('node:module')
const ts=require('typescript')
const root=path.resolve(__dirname,'..'), cache=new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod=new Module(file,module); cache.set(file,mod); mod.filename=file
  mod.paths=Module._nodeModulePaths(path.dirname(file))
  mod.require=name=>{
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name)
      const target=[base,base+'.ts',base+'.tsx'].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())
      if (target && /\.tsx?$/.test(target)) return load(target)
    }
    return require(name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
  return mod.exports
}
const {prepareFormalDocumentSave:prepare}=load(path.join(root,'cloudflare/admin-preview/formal-document-plan.ts'))
const version='2026-11-12T00:00:00.000Z'
const pointer=kind=>`_system/${kind}/1794441600000.webp`
test('Note edits retain other records, original input, longform blocks and version checks',()=>{
  const original=[{slug:'synthetic-note',title:'Old',published:false,updatedAt:version,blocks:[{id:'p',type:'paragraph',content:'Old paragraph'}]},{slug:'untouched-note',title:'Keep'}]
  const before=JSON.stringify(original)
  const raw={...original[0],title:'Updated',previousSlug:'synthetic-note',expectedUpdatedAt:version,blocks:[{id:'p',type:'paragraph',content:'New longform paragraph'}]}
  const plan=prepare('notes',original,raw,pointer('notes'))
  assert.equal(plan.saved.blocks[0].content,'New longform paragraph')
  assert.equal(plan.saved.published,false)
  assert.deepEqual(plan.records[1],original[1]); assert.equal(JSON.stringify(original),before)
  assert.equal(plan.writesEnabled,false); assert.equal(plan.publish,false)
  assert.throws(()=>prepare('notes',original,{...raw,expectedUpdatedAt:'stale'},pointer('notes')))
})
test('Guide edit preserves unrelated records, route data, aliases and own CAS contract',()=>{
  const original=[{slug:'synthetic-guide',aliases:['legacy-guide'],title:'Old',updatedAt:version},{slug:'untouched-guide',title:'Keep'}]
  const raw={...original[0],slug:'renamed-guide',title:'Updated',previousSlug:'synthetic-guide',expectedUpdatedAt:version,
    days:[{dayLabel:'Day 1',title:'Synthetic day',summary:'Itinerary',attractions:[{spotId:636,enabled:true}]}]}
  const plan=prepare('guides',original,raw,pointer('guides'))
  assert.equal(plan.saved.days[0].title,'Synthetic day')
  assert.ok(plan.saved.aliases.includes('synthetic-guide')); assert.ok(plan.saved.aliases.includes('legacy-guide'))
  assert.deepEqual(plan.records[1],original[1])
  assert.throws(()=>prepare('guides',original,{...raw,expectedUpdatedAt:undefined},pointer('guides')))
  assert.throws(()=>prepare('guides',original,raw,pointer('notes')))
})
test('private authority scope and new document identity conflicts fail before any write',()=>{
  const raw={slug:'synthetic-new',title:'New',published:true,blocks:[]}
  const plan=prepare('notes',[],raw,pointer('notes'))
  assert.equal(plan.records.length,1); assert.equal(plan.requiresPrivateAuthorityStore,true)
  assert.equal(plan.requiresServerMediaVerification,true)
  assert.equal(plan.saved.published,false)
  assert.equal(plan.requiresApprovedPublicationProjection,true)
  assert.throws(()=>prepare('notes',[],{...raw,action:'publish'},pointer('notes')))
  assert.throws(()=>prepare('notes',[{slug:raw.slug,title:'Existing'}],raw,pointer('notes')))
  assert.throws(()=>prepare('notes',[],raw,'https://untrusted.invalid/snapshot.json'))
})
test('alias collisions and invalid Guide budgets cannot become save plans',()=>{
  const records=[{slug:'first',aliases:['old-first'],title:'One',updatedAt:version},{slug:'second',aliases:['old-second'],title:'Two',updatedAt:version}]
  assert.throws(()=>prepare('notes',records,{slug:'second',title:'Collision',previousSlug:'first',expectedUpdatedAt:version},pointer('notes')))
  assert.throws(()=>prepare('guides',[],{slug:'bad-budget',title:'Budget',budget:'RM 100',budgetItems:[{label:'Hotel',amount:'200',currency:'MYR'}]},pointer('guides')))
})
