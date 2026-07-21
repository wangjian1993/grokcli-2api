export function fmtNum(n: unknown): string {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '0'
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1) + 'k'
  return String(Math.round(v))
}

export function fmtTime(v: unknown): string {
  if (v == null || v === '') return '—'
  try {
    const d = typeof v === 'number' ? new Date(v * (v < 1e12 ? 1000 : 1)) : new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toLocaleString()
  } catch {
    return String(v)
  }
}

export function fmtRemaining(epochSec: number): string {
  const sec = Math.max(0, Math.floor(epochSec - Date.now() / 1000))
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}
