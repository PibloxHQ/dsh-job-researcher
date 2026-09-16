/**
 * Minimal 5-field cron matcher (UTC). Supports star, number, and star-slash-n steps.
 * DSH has no native calendar cron - this is plugin-owned wall-clock.
 */
export function cronMatches(expr, date = new Date()) {
  const parts = String(expr || '').trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hour, dom, mon, dow] = parts
  const vals = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ]
  const fields = [min, hour, dom, mon, dow]
  return fields.every((field, i) => matchField(field, vals[i]))
}

function matchField(field, value) {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2))
    return Number.isFinite(step) && step > 0 && value % step === 0
  }
  return Number(field) === value
}

/** Next run approximation: scan forward up to 8 days, minute resolution. */
export function nextCronUtc(expr, from = new Date()) {
  const start = new Date(from.getTime())
  start.setUTCSeconds(0, 0)
  start.setUTCMinutes(start.getUTCMinutes() + 1)
  for (let i = 0; i < 60 * 24 * 8; i += 1) {
    const d = new Date(start.getTime() + i * 60_000)
    if (cronMatches(expr, d)) return d.toISOString()
  }
  return null
}
