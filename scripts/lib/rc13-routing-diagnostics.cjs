// Local-only diagnosis: never log credentials, query strings or response bodies.
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const target = path.resolve(process.env.JNQ_OFFLINE_OUTPUT, 'routing-network.jsonl')
if (!target.startsWith(path.resolve('artifacts') + path.sep)) throw new Error('Invalid diagnostics output')
const original = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = typeof first === 'object' && first !== null ? first.host : typeof args[1] === 'string' ? args[1] : undefined
  const port = typeof first === 'object' && first !== null ? first.port : first
  if (['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    const row = { host, port }
    fs.appendFileSync(target, JSON.stringify(row) + '\n')
    this.once('error', error => fs.appendFileSync(target, JSON.stringify({ ...row, error: error.code }) + '\n'))
  }
  return original.apply(this, args)
}
