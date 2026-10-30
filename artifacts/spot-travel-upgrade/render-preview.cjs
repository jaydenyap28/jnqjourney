const fs = require('node:fs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loader } = require('../../tests/helpers/spot-travel-loader.cjs')
const load=loader()
const {default:SpotContent}=load('components/SpotContent.tsx')
const {PublicLocaleProvider}=load('components/PublicLocale.tsx')
const bundle=JSON.parse(fs.readFileSync('public-data/fallback/2026-10-30.json','utf8'))
const dir='artifacts/spot-travel-upgrade'
for(const locale of ['zh','en']) {
  const html=renderToStaticMarkup(React.createElement(PublicLocaleProvider,{locale},React.createElement(SpotContent,{location:bundle.spots[411],mode:'page'})))
  fs.writeFileSync(`${dir}/preview-${locale}.html`,`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><style>body{margin:0;background:#020617;color:white}main{max-width:1080px;margin:auto}img{max-width:100%}</style></head><body><main><p style="padding:12px;font-size:12px;color:#aeb6c6">LOCAL RENDER REVIEW · public snapshot · controls are static</p>${html}</main></body></html>`)
}
;(async()=>{const postcss=require('postcss');const tailwind=require('@tailwindcss/postcss');const result=await postcss([tailwind()]).process(fs.readFileSync('app/globals.css','utf8'),{from:require('node:path').resolve('app/globals.css')});fs.writeFileSync(`${dir}/preview.css`,result.css);console.log('Rendered actual SpotContent with local CSS; no app build, providers or env files.')})().catch(e=>{console.error(e);process.exitCode=1})
