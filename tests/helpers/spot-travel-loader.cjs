const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
function loader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const req = id => {
      if (id in mocks) return mocks[id]
      if (id === 'server-only') return {}
      if (id === 'next/dynamic') return () => () => null
      if (id === 'next/cache') return { unstable_cache: fn => fn }
      if (id === 'next/navigation') return { usePathname: () => '/spot/example-1', useRouter: () => ({}) }
      if (id === 'next/link') return ({children,href,...props}) => React.createElement('a',{href,...props},children)
      if (id === 'next/image') return ({fill,priority,unoptimized,...props}) => React.createElement('img',props)
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? path.resolve(id.slice(2)) : path.resolve(path.dirname(file),id)
        const target = ['', '.ts','.tsx','.json'].map(ext=>base+ext).find(p=>fs.existsSync(p) && fs.statSync(p).isFile())
        if (!target) throw Error(`Missing ${id}`)
        return target.endsWith('.json') ? JSON.parse(fs.readFileSync(target,'utf8')) : load(target)
      }
      return require(id)
    }
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
    const scope = {process:{env:{},cwd:()=>process.cwd()},console,URL,Request,Response,Buffer,AbortSignal,setTimeout,clearTimeout,structuredClone,fetch,...globals}
    new Function('require','module','exports',...Object.keys(scope),code)(req,mod,mod.exports,...Object.values(scope))
    return mod.exports
  }
  return load
}
module.exports = { loader }
