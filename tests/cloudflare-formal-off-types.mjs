import assert from 'node:assert/strict'
import ts from 'typescript'
import path from 'node:path'
const program = ts.createProgram(['cloudflare/admin-preview/formal-prepared-edge.ts','tests/helpers/formal-deno-off.d.ts'], {
  noEmit: true, strict: true, allowJs: true, skipLibCheck: true, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022,
  baseUrl: process.cwd(), paths: { '@/*': ['./*'] }, allowImportingTsExtensions: true, esModuleInterop: true,
})
const diagnostics = ts.getPreEmitDiagnostics(program)
for (const error of diagnostics.slice(0, 20)) console.log(JSON.stringify({ code: error.code,
  file: error.file && path.relative(process.cwd(), error.file.fileName), message: ts.flattenDiagnosticMessageText(error.messageText, ' ') }))
assert.equal(diagnostics.length, 0, 'FORMAL_OFF_EDGE_TYPES_FAILED')
console.log('FORMAL_OFF_EDGE_TYPECHECK_PASS')
