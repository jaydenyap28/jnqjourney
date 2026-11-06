// Storage may be blocked in private browsing or embedded browsers. Keep IDs and
// attribution stable for the current document even when persistence is denied.
const memory = new Map<string, string>()

export function readAnalyticsStorage(key: string) {
  try { return window.localStorage.getItem(key) ?? memory.get(key) ?? null }
  catch { return memory.get(key) ?? null }
}

export function writeAnalyticsStorage(key: string, value: string) {
  memory.set(key, value)
  try { window.localStorage.setItem(key, value) } catch { /* Best effort. */ }
}
