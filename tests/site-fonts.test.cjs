const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const {execFileSync}=require('node:child_process')
const mod=require('next/dist/compiled/@next/font/dist/fontkit').default,create=mod.default||mod
const manifest=JSON.parse(fs.readFileSync('public/fonts/manifest.json','utf8'))
const css=fs.readFileSync('app/site-fonts.css','utf8')
const faces=[...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map(([,body])=>({
  body,family:body.match(/font-family:\s*'([^']+)'/)?.[1],weight:Number(body.match(/font-weight:\s*(\d+)/)?.[1]),
  url:body.match(/src:\s*url\('([^']+)'\)/)?.[1],range:body.match(/unicode-range:\s*([^;]+);/)?.[1],
}))
const fonts=new Map()
for(const asset of manifest.files){const bytes=fs.readFileSync(asset.file);fonts.set(asset.file,create(bytes))}
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')
const baseline=file=>execFileSync('git',['show',`0675b0abbb366aab4dd2bae5ca9214d1c6b40337:${file}`],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).replace(/\r\n/g,'\n')
const inRange=(cp,range)=>range.split(',').some(part=>{const [a,b]=part.trim().replace(/^U\+/i,'').split('-').map(value=>parseInt(value,16));return cp>=a&&cp<=(b??a)})

test('WOFF2 assets are authentic, bounded and retain each family license and configured weights',()=>{
  assert.equal(manifest.files.reduce((sum,f)=>sum+f.bytes,0),manifest.woff2Bytes)
  assert.ok(manifest.woff2Bytes<12*1024*1024)
  assert.ok(manifest.preloadBytes<150*1024)
  const weights={'Poppins':[300,400,600,800],'Noto Sans SC':[300,400,500,700],'Noto Serif SC':[400,500,600,700],'Cormorant Garamond':[400,500,600,700]}
  for(const family of manifest.families){
    assert.deepEqual(family.weights,weights[family.family]);assert.equal(family.package.license,'OFL-1.1')
    assert.match(read(`public/fonts/${family.id}/${family.package.version}/OFL.txt`),/SIL OPEN FONT LICENSE/)
    if(family.supplement)assert.match(read(`public/fonts/${family.id}/${family.package.version}/OFL-upstream.txt`),/SIL OPEN FONT LICENSE/)
  }
  for(const asset of manifest.files){
    const bytes=fs.readFileSync(asset.file)
    assert.equal(bytes.toString('ascii',0,4),'wOF2',asset.file);assert.equal(bytes.length,asset.bytes)
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file)
    assert.ok(fonts.get(asset.file).familyName.startsWith(asset.family),asset.file)
    if(asset.local)for(const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')assert.ok(fonts.get(asset.file).hasGlyphForCodePoint(char.codePointAt(0)),asset.file+': '+char)
    if(asset.variable)for(const weight of weights[asset.family]){const axis=fonts.get(asset.file).variationAxes.wght;assert.ok(axis.min<=weight&&axis.max>=weight)}
    if(!asset.local){
      const matches=faces.filter(face=>face.url==='/'+asset.file.replace(/^public\//,''))
      const expected=asset.variable?weights[asset.family]:[Number(asset.file.match(/-(\d+)-normal\.woff2$/)[1])]
      assert.deepEqual([...new Set(matches.map(face=>face.weight))].sort((a,b)=>a-b),expected)
      assert.ok(matches.every(face=>face.family===asset.family&&face.range&&face.body.includes('font-display: swap')))
    }
  }
})

test('all current Han text and common simplified/traditional repertoires have real glyphs and CSS coverage',()=>{
  const required=new Set(),walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
  for(const dir of ['app','components','data','public-data'])for(const file of walk(dir).filter(p=>/\.(json|tsx?)$/.test(p)))for(const char of read(file))if(/\p{Script=Han}/u.test(char))required.add(char.codePointAt(0))
  for(const [encoding,first,last,minTrail]of [['gb18030',0xb0,0xf7,0xa1],['big5',0xa4,0xc6,0x40]]){
    const decoder=new TextDecoder(encoding)
    for(let a=first;a<=last;a++)for(let b=minTrail;b<=0xfe;b++){
      if(encoding==='big5'&&a===0xc6&&b>0x7e)continue
      for(const char of decoder.decode(Uint8Array.of(a,b)))if(/[\u3400-\u9fff]/u.test(char))required.add(char.codePointAt(0))
    }
  }
  for(const char of '潓馝繁體臺灣旅遊馬來西亞檳城龜龍漢字，。！？「」『』（）—ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')required.add(char.codePointAt(0))
  for(const family of ['Noto Sans SC','Noto Serif SC']){
    const covered=new Set()
    for(const face of faces.filter(face=>face.family===family&&face.weight===400)){
      const font=fonts.get('public'+face.url)
      for(const cp of font.characterSet)if(inRange(cp,face.range))covered.add(cp)
    }
    const missing=[...required].filter(cp=>!covered.has(cp))
    assert.deepEqual(missing.map(cp=>String.fromCodePoint(cp)),[],family)
  }
})

test('Latin extensions keep the original Latin families instead of dropping to metric fallback',()=>{
  for(const family of manifest.families.filter(f=>!f.family.startsWith('Noto')))for(const weight of family.weights){
    const candidates=manifest.files.filter(asset=>asset.family===family.family&&asset.local
      &&(asset.variable||asset.file.includes('-'+weight+'-'))).map(asset=>({font:fonts.get(asset.file)}))
    for(const face of faces.filter(face=>face.family===family.family&&face.weight===weight))candidates.push({font:fonts.get('public'+face.url),range:face.range})
    for(const char of 'ABCxyz0123ŁłĀāČč'){
      const cp=char.codePointAt(0)
      assert.ok(candidates.some(candidate=>(!candidate.range||inRange(cp,candidate.range))&&candidate.font.hasGlyphForCodePoint(cp)),family.family+': '+char)
    }
  }
})

test('font integration preserves non-font layout, CSS variables and original fallback metrics',()=>{
  const normalizeLayout=s=>s.replace(/import \{ (?:Cormorant_Garamond[^\n]+|siteFontClassName) \} from '[^']+'\n/g,'')
    .replace('<Suspense fallback={null}><PageViewTracker /></Suspense>', '<PageViewTracker />')
    .replace(/const notoSansSC = Noto_Sans_SC\([\s\S]*?(?=import \{ buildMetaDescription)/,'')
    .replace(/className=\{`\$\{poppins.variable\}[^`]+`\}/,'className={FONT}')
    .replace('className={siteFontClassName}','className={FONT}').replace(/\s+/g,' ').trim()
  assert.equal(normalizeLayout(read('app/layout.tsx')),normalizeLayout(baseline('app/layout.tsx')))
  const normalizeApp=s=>s.replace(/import \{ (?:Cormorant_Garamond[^\n]+|siteFontClassName) \} from '[^']+'\n/g,'')
    .replace("import PagesAnalytics from '@/components/PagesAnalytics'\n", '').replace('<PagesAnalytics/>', '')
    .replace(/const sans = Poppins\([\s\S]*?(?=export default function App)/,'')
    .replace(/className=\{`\$\{sans.variable\}[^`]+`\}/,'className={FONT}')
    .replace('className={siteFontClassName}','className={FONT}').replace(/\s+/g,' ').trim()
  assert.equal(normalizeApp(read('pages/_app.tsx')),normalizeApp(baseline('pages/_app.tsx')))
  assert.equal(read('app/globals.css').replace('@import "./site-fonts.css";\n',''),baseline('app/globals.css'))
  const entry=read('lib/site-fonts.ts');assert.match(entry,/from 'next\/font\/local'/)
  for(const name of ['poppins','noto-sans-sc','noto-serif-sc','cormorant-garamond'])assert.ok((entry+css).includes('--font-'+name))
  const {getFallbackFontOverrideMetrics}=require('next/dist/compiled/@next/font/dist/google/get-fallback-font-override-metrics')
  for(const family of manifest.families){
    assert.deepEqual(family.fallbackMetrics,getFallbackFontOverrideMetrics(family.family))
    const face=faces.find(face=>face.family===family.family+' Site Fallback')
    for(const value of Object.values(family.fallbackMetrics))assert.ok(face.body.includes(value))
  }
  assert.ok(manifest.files.filter(f=>f.local).every(f=>!f.family.startsWith('Noto')))
  assert.ok(manifest.files.filter(f=>f.local).every(f=>entry.includes(path.basename(f.file))))
})

test('both Routers use the shared local entry and the locked dependency graph is unchanged',()=>{
  for(const file of ['app/layout.tsx','pages/_app.tsx']){assert.match(read(file),/from '@\/lib\/site-fonts'/);assert.doesNotMatch(read(file),/next\/font\/google/)}
  assert.doesNotMatch(css,/https?:|fonts\.gstatic|fonts\.googleapis/)
  assert.equal(read('package-lock.json'),baseline('package-lock.json'))
  assert.equal(require('next/package.json').version,'14.2.35')
  assert.equal(require('@supabase/supabase-js/package.json').version,'2.93.3')
})
