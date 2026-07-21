/** 通用数量缩写：k / M / B（请求数等） */
export function fmtNum(n: unknown): string {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '0'
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + 'B'
  if (a >= 1e6) return sign + (a / 1e6).toFixed(2) + 'M'
  if (a >= 1e3) return sign + (a / 1e3).toFixed(a >= 1e4 ? 1 : 2) + 'k'
  return sign + String(Math.round(a))
}

/**
 * Token 展示：与旧管理台一致 — k / M / B 缩写，可选单位后缀。
 * 例：fmtTokens(1234567) → "1.23M token"
 */
export function fmtTokens(n: unknown, unit = 'token'): string {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return `${fmtNum(num)}${unit ? ` ${unit}` : ''}`
}

/** 明细表内 token 数：k/M/B，无单位；空/0 仍显示 0 */
export function fmtTokenCell(n: unknown): string {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return fmtNum(num)
}

/**
 * 图表 / 动画用：原始 token → 以「百万」为单位的数值。
 * （仅数值轴；文案展示请用 fmtTokens / fmtNum）
 */
export function tokensToM(n: unknown, digits = 2): number {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return 0
  const f = Math.pow(10, digits)
  return Math.round((v / 1e6) * f) / f
}

/** 优先 billed_tokens（total − cache_read），否则 total_tokens */
export function usageBilled(obj: any): number {
  if (!obj || typeof obj !== 'object') return 0
  if (obj.billed_tokens != null && obj.billed_tokens !== '') {
    return Number(obj.billed_tokens) || 0
  }
  if (obj.total_tokens != null && obj.total_tokens !== '') {
    return Number(obj.total_tokens) || 0
  }
  return 0
}

/** 输入侧计费 token（已扣 cache_read） */
export function promptBilled(obj: any): number {
  if (!obj || typeof obj !== 'object') return 0
  if (obj.prompt_tokens_billed != null && obj.prompt_tokens_billed !== '') {
    return Number(obj.prompt_tokens_billed) || 0
  }
  const prompt = Number(obj.prompt_tokens) || 0
  const cache = Number(obj.cache_read_tokens) || 0
  return Math.max(0, prompt - cache)
}

/** 单条事件计费 token */
export function eventBilled(it: any): number {
  if (!it || typeof it !== 'object') return 0
  if (it.billed_tokens != null && it.billed_tokens !== '') {
    return Number(it.billed_tokens) || 0
  }
  const total = Number(it.total_tokens) || 0
  const cache = Number(it.cache_read_tokens) || 0
  return Math.max(0, total - cache)
}

export function fmtLatency(ms: unknown): string {
  if (ms == null || ms === '' || Number.isNaN(Number(ms))) return '—'
  const n = Number(ms)
  if (n < 1000) return `${Math.round(n)} ms`
  return `${(n / 1000).toFixed(n >= 10000 ? 1 : 2)} s`
}

/** 解析为 Date：支持秒/毫秒时间戳、数字字符串、ISO */
export function parseTime(v: unknown): Date | null {
  if (v == null || v === '') return null
  try {
    let d: Date
    if (typeof v === 'number') {
      d = new Date(v < 1e12 ? v * 1000 : v)
    } else {
      const s = String(v).trim()
      if (!s) return null
      if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s)
        d = new Date(n < 1e12 ? n * 1000 : n)
      } else {
        d = new Date(s)
      }
    }
    if (Number.isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

function pad2(n: number | string): string {
  return String(n).padStart(2, '0')
}

/**
 * 统一时间：Asia/Shanghai · YYYY-MM-DD HH:mm:ss
 * （与用量日切时区一致）
 */
export function fmtTime(v: unknown): string {
  const d = parseTime(v)
  if (!d) return v == null || v === '' ? '—' : String(v)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
    // en-US 24h 偶发 24:xx → 规范为 00
    let hour = get('hour')
    if (hour === '24') hour = '00'
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
  } catch {
    // fallback local
    const y = d.getFullYear()
    const m = pad2(d.getMonth() + 1)
    const day = pad2(d.getDate())
    const h = pad2(d.getHours())
    const mi = pad2(d.getMinutes())
    const s = pad2(d.getSeconds())
    return `${y}-${m}-${day} ${h}:${mi}:${s}`
  }
}

/** 表格短时间：MM-DD HH:mm:ss（同年省略年） */
export function fmtTimeShort(v: unknown): string {
  const full = fmtTime(v)
  if (full === '—' || full.length < 19) return full
  const nowY = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date())
  if (full.startsWith(nowY + '-')) return full.slice(5) // MM-DD HH:mm:ss
  return full
}

export function fmtRemaining(epochSec: number): string {
  const sec = Math.max(0, Math.floor(epochSec - Date.now() / 1000))
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

/** 过期时间：绝对时间 + 剩余/已过期 */
export function fmtExpiry(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) {
    const t = fmtTime(v)
    return t === '—' ? String(v) : t
  }
  const sec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
  const now = Math.floor(Date.now() / 1000)
  const abs = fmtTime(sec)
  if (sec <= now) return `已过期 · ${abs}`
  return `${abs} · 剩 ${fmtRemaining(sec)}`
}

/** 冷却：剩余时长优先，否则 until 绝对时间 */
export function fmtCooldown(
  until: unknown,
  remainingSec?: unknown,
): string {
  const rem = Number(remainingSec)
  if (Number.isFinite(rem) && rem > 0) {
    const end = Math.floor(Date.now() / 1000) + rem
    return `${fmtRemaining(end)} · 至 ${fmtTime(end)}`
  }
  if (until == null || until === '') return '—'
  const n = typeof until === 'number' ? until : Number(until)
  if (!Number.isFinite(n)) return fmtTime(until)
  const sec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
  const now = Math.floor(Date.now() / 1000)
  if (sec <= now) return '—'
  return `${fmtRemaining(sec)} · 至 ${fmtTime(sec)}`
}

/** 是否具备可展示的额度快照 */
export function hasQuotaInfo(q: any): boolean {
  if (!q || typeof q !== 'object') return false
  if (
    q.probing &&
    !q.account_type &&
    !q.plan &&
    q.tokens_limit == null &&
    q.monthly_limit == null &&
    !q.summary
  ) {
    return false
  }
  if (
    q.tokens_limit != null ||
    q.tokens_remaining != null ||
    q.tokens_used != null ||
    q.tokens_actual != null
  ) {
    return true
  }
  if (q.monthly_limit != null || q.used != null || q.remaining != null) return true
  if (Number(q.weekly_limit) > 0 || q.weekly_used != null) return true
  if (q.account_type || q.plan || q.free_tokens) return true
  if (q.display?.summary && q.display.summary !== '—') return true
  if (q.summary && String(q.summary) !== '—') return true
  if (q.ok === true && !q.error) return true
  return false
}

/** 额度文案：Free token / SuperGrok USD */
export function fmtQuotaLabel(q: any): string {
  if (!q || typeof q !== 'object') return '—'
  if (!hasQuotaInfo(q)) {
    if (q.error) return '未查询'
    return '—'
  }
  const plan = String(q.account_type || q.plan || '').toLowerCase()
  const isFree =
    plan === 'free' ||
    !!q.free_tokens ||
    !!q.unlimited_or_free ||
    (q.tokens_limit != null &&
      !(Number(q.monthly_limit) > 0) &&
      !(Number(q.weekly_limit) > 0))

  if (isFree) {
    let limit = q.tokens_limit != null ? Number(q.tokens_limit) : null
    let remaining = q.tokens_remaining != null ? Number(q.tokens_remaining) : null
    let used =
      q.tokens_used != null
        ? Number(q.tokens_used)
        : q.tokens_actual != null
          ? Number(q.tokens_actual)
          : null
    if ((used == null || !Number.isFinite(used)) && limit != null && remaining != null) {
      used = Math.max(0, limit - remaining)
    }
    if ((remaining == null || !Number.isFinite(remaining)) && limit != null && used != null) {
      remaining = Math.max(0, limit - used)
    }
    let pct =
      q.tokens_usage_percent != null ? Number(q.tokens_usage_percent) : null
    if ((pct == null || !Number.isFinite(pct)) && limit && limit > 0 && used != null) {
      pct = (used / limit) * 100
    }
    if (pct != null && Number.isFinite(pct)) pct = Math.max(0, Math.min(100, Math.round(pct)))
    else pct = null
    if (limit != null && limit > 0) {
      return (
        `${fmtNum(used || 0)} / ${fmtNum(limit)}` +
        (pct != null ? ` · ${pct}%` : '') +
        (remaining != null ? ` · 剩 ${fmtNum(remaining)}` : '')
      )
    }
    if (remaining != null) return `剩 ${fmtNum(remaining)}`
    return 'Free'
  }

  const fmtUsd = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return '$' + n.toFixed(2)
  }
  let limit = q.monthly_limit != null ? Number(q.monthly_limit) : null
  let used = q.used != null ? Number(q.used) : null
  let remaining = q.remaining != null ? Number(q.remaining) : null
  if ((remaining == null || !Number.isFinite(remaining)) && limit != null && used != null) {
    remaining = Math.max(0, limit - used)
  }
  if ((used == null || !Number.isFinite(used)) && limit != null && remaining != null) {
    used = Math.max(0, limit - remaining)
  }
  if (limit != null) {
    return `月 ${fmtUsd(used || 0)} / ${fmtUsd(limit)}` +
      (remaining != null ? ` · 剩 ${fmtUsd(remaining)}` : '')
  }
  if (q.display?.summary) return String(q.display.summary)
  if (q.summary) return String(q.summary)
  return '—'
}


export type QuotaUsage = {
  used: number | null
  limit: number | null
  remaining: number | null
  pct: number | null
  unit: 'token' | 'usd' | ''
  text: string
  weeklyText: string
  plan: string
}

/** 解析套餐：free / supergrok / team / … */
export function resolveAccountPlan(q: any, account?: any): string {
  const raw =
    q?.account_type ||
    q?.plan ||
    account?.account_type ||
    account?.plan ||
    account?._pool?.account_type ||
    account?._pool?.plan ||
    ''
  const s = String(raw || '').toLowerCase().trim()
  if (!s) {
    if (q?.free_tokens || q?.unlimited_or_free) return 'free'
    if (q?.tokens_limit != null && !(Number(q.monthly_limit) > 0)) return 'free'
    if (Number(q?.monthly_limit) > 0 || Number(q?.weekly_limit) > 0) return 'supergrok'
    return ''
  }
  if (s.includes('super')) return 'supergrok'
  if (s.includes('team') || s.includes('org')) return 'team'
  if (s === 'free' || s.includes('free')) return 'free'
  return s
}

/** 额度用量结构（进度条 / 文案） */
export function calcQuotaUsage(q: any, account?: any): QuotaUsage {
  const empty: QuotaUsage = {
    used: null,
    limit: null,
    remaining: null,
    pct: null,
    unit: '',
    text: '—',
    weeklyText: '',
    plan: '',
  }
  if (!q || typeof q !== 'object') return empty
  const plan = resolveAccountPlan(q, account)
  const isFree =
    plan === 'free' ||
    !!q.free_tokens ||
    !!q.unlimited_or_free ||
    (q.tokens_limit != null &&
      !(Number(q.monthly_limit) > 0) &&
      !(Number(q.weekly_limit) > 0))

  if (isFree) {
    let limit = q.tokens_limit != null ? Number(q.tokens_limit) : null
    let remaining = q.tokens_remaining != null ? Number(q.tokens_remaining) : null
    let used =
      q.tokens_used != null
        ? Number(q.tokens_used)
        : q.tokens_actual != null
          ? Number(q.tokens_actual)
          : null
    if ((used == null || !Number.isFinite(used)) && limit != null && remaining != null) {
      used = Math.max(0, limit - remaining)
    }
    if ((remaining == null || !Number.isFinite(remaining)) && limit != null && used != null) {
      remaining = Math.max(0, limit - used)
    }
    let pct = q.tokens_usage_percent != null ? Number(q.tokens_usage_percent) : null
    if ((pct == null || !Number.isFinite(pct)) && limit && limit > 0 && used != null) {
      pct = (used / limit) * 100
    }
    if (pct != null && Number.isFinite(pct)) pct = Math.max(0, Math.min(100, Math.round(pct)))
    else pct = null
    const text =
      limit != null && limit > 0
        ? `${fmtNum(used || 0)} / ${fmtNum(limit)}` +
          (pct != null ? ` · ${pct}%` : '') +
          (remaining != null ? ` · 剩 ${fmtNum(remaining)}` : '')
        : remaining != null
          ? `剩 ${fmtNum(remaining)}`
          : '—'
    return {
      used,
      limit,
      remaining,
      pct,
      unit: 'token',
      text,
      weeklyText: '',
      plan: plan || 'free',
    }
  }

  const fmtUsd = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return '$' + n.toFixed(2)
  }
  let limit = q.monthly_limit != null ? Number(q.monthly_limit) : null
  let used = q.used != null ? Number(q.used) : null
  let remaining = q.remaining != null ? Number(q.remaining) : null
  if ((remaining == null || !Number.isFinite(remaining)) && limit != null && used != null) {
    remaining = Math.max(0, limit - used)
  }
  if ((used == null || !Number.isFinite(used)) && limit != null && remaining != null) {
    used = Math.max(0, limit - remaining)
  }
  let pct = q.usage_percent != null ? Number(q.usage_percent) : null
  if ((pct == null || !Number.isFinite(pct)) && limit && limit > 0 && used != null) {
    pct = (used / limit) * 100
  }
  if (pct != null && Number.isFinite(pct)) pct = Math.max(0, Math.min(100, Math.round(pct)))
  else pct = null

  let text =
    limit != null
      ? `月 ${fmtUsd(used || 0)} / ${fmtUsd(limit)}` +
        (pct != null ? ` · ${pct}%` : '') +
        (remaining != null ? ` · 剩 ${fmtUsd(remaining)}` : '')
      : '—'

  let weeklyText = ''
  const wl = q.weekly_limit != null ? Number(q.weekly_limit) : null
  const wu = q.weekly_used != null ? Number(q.weekly_used) : null
  let wr = q.weekly_remaining != null ? Number(q.weekly_remaining) : null
  if (wl != null && wl > 0) {
    if (wr == null && wu != null) wr = Math.max(0, wl - wu)
    let wp = q.weekly_usage_percent != null ? Number(q.weekly_usage_percent) : null
    if ((wp == null || !Number.isFinite(wp)) && wu != null) wp = (wu / wl) * 100
    if (wp != null && Number.isFinite(wp)) wp = Math.max(0, Math.min(100, Math.round(wp)))
    weeklyText =
      `周 ${fmtUsd(wu || 0)} / ${fmtUsd(wl)}` +
      (wp != null ? ` · ${wp}%` : '') +
      (wr != null ? ` · 剩 ${fmtUsd(wr)}` : '')
    if (wp != null && (pct == null || wp > pct)) pct = wp
  }

  const odc = q.on_demand_cap != null ? Number(q.on_demand_cap) : null
  const odu = q.on_demand_used != null ? Number(q.on_demand_used) : null
  if (odc != null && odc > 0) {
    const odLine = `按需 ${fmtUsd(odu || 0)} / ${fmtUsd(odc)}`
    text = text === '—' ? odLine : text + ' · ' + odLine
  }

  if (text === '—' && q.display?.summary) text = String(q.display.summary)
  if (text === '—' && q.summary) text = String(q.summary)

  return {
    used,
    limit,
    remaining,
    pct,
    unit: 'usd',
    text,
    weeklyText,
    plan: plan || 'supergrok',
  }
}

/** 相对时间：n 秒前 / n 分钟前 */
export function fmtAge(epochSec: unknown): string {
  if (epochSec == null || epochSec === '') return ''
  let n = Number(epochSec)
  if (!Number.isFinite(n)) return ''
  if (n > 1e12) n = Math.floor(n / 1000)
  const age = Math.max(0, Math.floor(Date.now() / 1000 - n))
  if (age < 60) return `${age}s 前`
  if (age < 3600) return `${Math.floor(age / 60)}m 前`
  if (age < 86400) return `${Math.floor(age / 3600)}h 前`
  return `${Math.floor(age / 86400)}d 前`
}

export function planLabel(plan: string): string {
  if (!plan) return ''
  if (plan === 'supergrok') return 'SuperGrok'
  if (plan === 'team') return 'Team'
  if (plan === 'free') return 'Free'
  return plan
}

export function planTagColor(plan: string): string {
  if (plan === 'free') return 'success'
  if (plan === 'supergrok') return 'blue'
  if (plan === 'team') return 'purple'
  return 'default'
}
