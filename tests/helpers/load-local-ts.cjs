const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript')
const root=path.resolve(__dirname,'../..'),cache=new Map()
module.exports=function load(file,overrides={}) {
  if(cache.has(file))return cache.get(file).exports
  const mod=new Module(file,module);cache.set(file,mod);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file))
  mod.require=name=>{
    if(Object.hasOwn(overrides,name))return overrides[name]
    if(name.startsWith('.')||name.startsWith('@/')){
      const base=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name)
      const target=[base,base+'.ts',base+'.tsx'].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())
      if(target&&/\.tsx?$/.test(target))return load(target,overrides)
    }
    return Module.createRequire(file)(name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
  return mod.exports
}
