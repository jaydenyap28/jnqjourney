const fixedMessages = new Set([
  '请使用现有管理员会话打开本页。', '只读权限核验失败。', '景点详细资料不一致。',
  '需有仍有效的会话，避免将过期误认为退出保护。', '退出服务端会话失败。',
  '旧会话已自然过期，退出保护结果不能计为 PASS。',
])
const structuredMessages = [
  /^资料读取或数量不符：(data|notes|guides)$/,
  /^正式写入拦截异常：(POST|PATCH|DELETE) \/(admin\/(locations|notes|guides)|upload\/r2|publication)$/,
  /^拒绝请求后资料发生变化：\/admin\/(locations|notes|guides)$/,
  /^旧会话重放未被拒绝，HTTP [1-5][0-9]{2}$/,
]
export function safeReadonlyFailure(error) {
  const message = error instanceof Error ? error.message : ''
  return fixedMessages.has(message) || structuredMessages.some(pattern => pattern.test(message)) ? message :
    '请求未完成或响应格式异常。请提供本页结果，不要提供密码或 Token。'
}

export function requireUnexpiredReplayWindow(expiresAtMs, now = Date.now()) {
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) throw Error('旧会话已自然过期，退出保护结果不能计为 PASS。')
}
