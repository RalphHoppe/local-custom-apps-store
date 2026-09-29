import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  Eye,
  LoaderCircle,
  MousePointerClick,
  Radio,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppCardSkeleton } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'

interface AnalyticsTotals { views: number; actions: number; visitors: number; favorites: number; conversion: number; actionsPerVisitor: number }
interface DailyPoint { date: string; views: number; actions: number; visitors: number }
interface AppInsight { id: string; name: string; category: string; version: string; views: number; actions: number; visitors: number; conversion: number }
interface AnalyticsSummary {
  days: number
  generatedAt: string
  totals: AnalyticsTotals
  previousTotals: AnalyticsTotals
  retention: { returningVisitors: number; rate: number }
  daily: DailyPoint[]
  apps: AppInsight[]
  platforms: { name: string; count: number; percentage: number }[]
  releases: { appId: string; appName: string; version: string; actions: number; percentage: number }[]
  eventBreakdown: { type: string; count: number }[]
  privacy: { retentionDays: number; anonymous: boolean; storesAccountIds: boolean; storesIpAddresses: boolean; storesRawUserAgent: boolean }
}

const emptySummary: AnalyticsSummary = {
  days: 30, generatedAt: new Date().toISOString(),
  totals: { views: 0, actions: 0, visitors: 0, favorites: 0, conversion: 0, actionsPerVisitor: 0 },
  previousTotals: { views: 0, actions: 0, visitors: 0, favorites: 0, conversion: 0, actionsPerVisitor: 0 },
  retention: { returningVisitors: 0, rate: 0 }, daily: [], apps: [], platforms: [], releases: [], eventBreakdown: [],
  privacy: { retentionDays: 90, anonymous: true, storesAccountIds: false, storesIpAddresses: false, storesRawUserAgent: false },
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0
  return Math.round((current - previous) / previous * 1000) / 10
}

function formatNumber(value: number) { return new Intl.NumberFormat(undefined, { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function dateLabel(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }

export function AnalyticsPage() {
  const { user, realtimeSignal, realtimeStatus } = useStore()
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)
  const requestRef = useRef(0)
  const isAdmin = user?.role === 'admin'

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestRef.current
    if (silent) setRefreshing(true); else setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/analytics/summary?days=${days}`)
      if (!response.ok) throw new Error(await getResponseError(response))
      const nextSummary = await response.json() as AnalyticsSummary
      if (requestRef.current === requestId) setSummary(nextSummary)
    } catch (cause) {
      if (requestRef.current === requestId) setError(cause instanceof Error ? cause.message : 'Analytics could not be loaded.')
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false); setRefreshing(false); loadedRef.current = true
      }
    }
  }, [days])

  useEffect(() => { loadedRef.current = false; void load(false) }, [load])
  useEffect(() => {
    if (!loadedRef.current || realtimeSignal.type !== 'analytics.changed') return
    const timer = window.setTimeout(() => void load(true), 450)
    return () => window.clearTimeout(timer)
  }, [load, realtimeSignal.sequence, realtimeSignal.type])

  const daily = useMemo(() => fillDaily(summary.daily, days), [summary.daily, days])
  const exportCsv = () => {
    const rows = [['Date', 'Views', 'Downloads / opens', 'Visitors'], ...daily.map((item) => [item.date, item.views, item.actions, item.visitors])]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' })
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `local-analytics-${days}d.csv`; anchor.click(); URL.revokeObjectURL(anchor.href)
  }

  if (loading) return <div className="page analytics-page"><AppCardSkeleton count={6} /></div>

  const hasActivity = summary.totals.views + summary.totals.actions + summary.totals.favorites > 0
  return (
    <div className="page analytics-page">
      <section className="analytics-header">
        <div><p className="eyebrow"><Sparkles size={14} /> {isAdmin ? 'Store intelligence' : 'Publisher intelligence'}</p><h1>{isAdmin ? 'Analytics overview' : 'Your app insights'}</h1><p>{isAdmin ? 'Understand discovery, conversion, and release adoption across the public shelf.' : 'See how people discover and use your approved apps.'}</p></div>
        <div className="analytics-header__actions"><span className={`analytics-live analytics-live--${realtimeStatus}`}><Radio size={12} />{realtimeStatus === 'live' ? 'Live updates' : realtimeStatus}</span><button type="button" className="button button--secondary" onClick={exportCsv} disabled={!hasActivity}><Download size={16} /> Export CSV</button></div>
      </section>

      <div className="analytics-toolbar"><div className="analytics-range">{[7, 30, 90].map((range) => <button type="button" className={days === range ? 'is-active' : ''} aria-pressed={days === range} onClick={() => setDays(range)} key={range}>{range === 7 ? '7 days' : range === 30 ? '30 days' : '90 days'}</button>)}</div><span>{refreshing && <LoaderCircle className="spin" size={13} />} Updated {new Date(summary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><button type="button" className="icon-button icon-button--small" onClick={() => void load(true)} aria-label="Refresh analytics" disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} size={15} /></button></div>
      {error && <div className="admin-error"><Activity size={18} /><span>{error}</span><button type="button" onClick={() => void load(false)}>Try again</button></div>}

      <section className="analytics-metrics">
        <Metric icon={<Eye />} label="App views" value={formatNumber(summary.totals.views)} delta={percentChange(summary.totals.views, summary.previousTotals.views)} tone="violet" />
        <Metric icon={<MousePointerClick />} label="Downloads & opens" value={formatNumber(summary.totals.actions)} delta={percentChange(summary.totals.actions, summary.previousTotals.actions)} tone="blue" />
        <Metric icon={<UsersRound />} label="Unique visitors" value={formatNumber(summary.totals.visitors)} delta={percentChange(summary.totals.visitors, summary.previousTotals.visitors)} tone="green" />
        <Metric icon={<BarChart3 />} label="View conversion" value={`${summary.totals.conversion}%`} delta={summary.totals.conversion - summary.previousTotals.conversion} tone="amber" suffix="pts" />
        <Metric icon={<Repeat2 />} label="Returning rate" value={`${summary.retention.rate}%`} detail={`${summary.retention.returningVisitors} returning`} tone="plum" />
      </section>

      {!hasActivity && <section className="analytics-empty"><span><BarChart3 /></span><div><p className="eyebrow">Collection starts now</p><h2>Your dashboard is ready for its first signal.</h2><p>Views, downloads, and web-app opens appear here immediately. Empty data is never replaced with invented sample activity.</p></div></section>}

      <section className="analytics-grid analytics-grid--hero">
        <article className="analytics-card analytics-chart-card"><div className="analytics-card__heading"><div><p>Activity over time</p><h2>Discovery and action</h2></div><div className="chart-legend"><span><i className="is-views" /> Views</span><span><i className="is-actions" /> Downloads & opens</span></div></div><ActivityChart points={daily} /><div className="chart-axis"><span>{dateLabel(daily[0].date)}</span><span>{dateLabel(daily[Math.floor(daily.length / 2)].date)}</span><span>{dateLabel(daily[daily.length - 1].date)}</span></div></article>
        <article className="analytics-card"><div className="analytics-card__heading"><div><p>Audience quality</p><h2>Visitor behavior</h2></div><UsersRound /></div><div className="behavior-ring" style={{ '--progress': `${Math.min(100, summary.retention.rate)}%` } as React.CSSProperties}><div><strong>{summary.retention.rate}%</strong><span>returned</span></div></div><div className="behavior-facts"><span><small>Actions / visitor</small><strong>{summary.totals.actionsPerVisitor}</strong></span><span><small>New or one-time</small><strong>{Math.max(0, summary.totals.visitors - summary.retention.returningVisitors)}</strong></span><span><small>Favorite saves</small><strong>{summary.totals.favorites}</strong></span></div></article>
      </section>

      <section className="analytics-grid analytics-grid--split">
        <article className="analytics-card"><div className="analytics-card__heading"><div><p>Performance by listing</p><h2>Top apps</h2></div><BarChart3 /></div><div className="app-insight-list">{summary.apps.slice(0, 8).map((app, index) => <div className="app-insight-row" key={app.id}><span className="app-insight-rank">{index + 1}</span><span><strong>{app.name}</strong><small>{app.category} · v{app.version}</small></span><div><strong>{app.actions}</strong><small>actions</small></div><div><strong>{app.conversion}%</strong><small>conversion</small></div><span className="app-insight-bar"><i style={{ width: `${summary.apps[0]?.actions ? Math.max(4, app.actions / summary.apps[0].actions * 100) : 0}%` }} /></span></div>)}{!summary.apps.length && <SmallEmpty text="Publish an app to begin comparing performance." />}</div></article>
        <article className="analytics-card"><div className="analytics-card__heading"><div><p>Action environment</p><h2>Platforms</h2></div><MousePointerClick /></div><div className="platform-insights">{summary.platforms.map((platform, index) => <div key={platform.name}><span className={`platform-color platform-color--${index % 5}`} /><span><strong>{platform.name}</strong><small>{platform.count} actions</small></span><div><i style={{ width: `${platform.percentage}%` }} /></div><b>{platform.percentage}%</b></div>)}{!summary.platforms.length && <SmallEmpty text="Platform distribution appears after the first download or open." />}</div></article>
      </section>

      <section className="analytics-grid analytics-grid--split">
        <article className="analytics-card"><div className="analytics-card__heading"><div><p>Version adoption</p><h2>Active releases</h2></div><Repeat2 /></div><div className="release-adoption-list">{summary.releases.slice(0, 10).map((release) => <div key={`${release.appId}-${release.version}`}><span><strong>{release.appName}</strong><small>Version {release.version}</small></span><div><i style={{ width: `${release.percentage}%` }} /></div><b>{release.actions}</b></div>)}{!summary.releases.length && <SmallEmpty text="Release adoption appears when an approved version is downloaded or opened." />}</div></article>
        <article className="analytics-card privacy-card"><div className="analytics-card__heading"><div><p>Privacy by design</p><h2>Useful, not invasive</h2></div><ShieldCheck /></div><ul><li><CheckItem>Anonymous browser identifiers rotate every 30 days.</CheckItem></li><li><CheckItem>Activity is never linked to account IDs.</CheckItem></li><li><CheckItem>Events are retained for {summary.privacy.retentionDays} days.</CheckItem></li><li><CheckItem>IP addresses and raw user-agent strings are never stored.</CheckItem></li><li><CheckItem>Browser “Do Not Track” is respected automatically.</CheckItem></li></ul></article>
      </section>
    </div>
  )
}

function Metric({ icon, label, value, delta, detail, tone, suffix = '%' }: { icon: ReactNode; label: string; value: string; delta?: number; detail?: string; tone: string; suffix?: string }) {
  const direction = (delta ?? 0) >= 0
  return <article className={`analytics-metric analytics-metric--${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail ? <em>{detail}</em> : delta !== undefined && <em className={direction ? 'is-up' : 'is-down'}>{direction ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(delta)}{suffix}</em>}</div></article>
}

function fillDaily(points: DailyPoint[], days: number) {
  const map = new Map(points.map((point) => [point.date, point]))
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (days - index - 1))
    const key = date.toISOString().slice(0, 10)
    return map.get(key) ?? { date: key, views: 0, actions: 0, visitors: 0 }
  })
}

function ActivityChart({ points }: { points: DailyPoint[] }) {
  const width = 720, height = 225, padding = 13
  const max = Math.max(1, ...points.flatMap((point) => [point.views, point.actions]))
  const path = (key: 'views' | 'actions') => points.map((point, index) => `${index ? 'L' : 'M'} ${padding + index / Math.max(1, points.length - 1) * (width - padding * 2)} ${height - padding - point[key] / max * (height - padding * 2)}`).join(' ')
  const area = `${path('views')} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`
  return <div className="activity-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Views and actions over time"><defs><linearGradient id="views-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6a5aed" stopOpacity=".24" /><stop offset="1" stopColor="#6a5aed" stopOpacity="0" /></linearGradient></defs>{[.25, .5, .75, 1].map((value) => <line key={value} x1={padding} x2={width - padding} y1={height - padding - value * (height - padding * 2)} y2={height - padding - value * (height - padding * 2)} className="chart-gridline" />)}<path d={area} fill="url(#views-area)" /><path d={path('views')} className="chart-line chart-line--views" /><path d={path('actions')} className="chart-line chart-line--actions" /></svg></div>
}

function CheckItem({ children }: { children: ReactNode }) { return <><ShieldCheck size={15} /><span>{children}</span></> }
function SmallEmpty({ text }: { text: string }) { return <div className="analytics-small-empty"><Activity size={19} /><span>{text}</span></div> }
