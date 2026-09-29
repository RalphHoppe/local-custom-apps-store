import { AlertTriangle, CheckCircle2, Eye, EyeOff, Flag, LoaderCircle, RotateCcw, ShieldCheck, Star, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getResponseError, useStore } from '../store/StoreContext'

interface ModerationReport {
  id: string
  reviewId: string
  appId: string
  appName: string
  reporterName: string
  reason: string
  details: string
  status: 'open' | 'resolved' | 'dismissed'
  resolutionNote: string
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  review: { userName: string; rating: number; title: string; body: string; status: 'published' | 'hidden'; createdAt: string }
}

export function ReviewModerationPanel() {
  const { realtimeSignal, notify } = useStore()
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open')
  const [reports, setReports] = useState<ModerationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [hideTarget, setHideTarget] = useState<ModerationReport | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/review-reports?status=${status}`)
      if (!response.ok) throw new Error(await getResponseError(response))
      setReports(await response.json() as ModerationReport[])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Community reports could not be loaded.') }
    finally { setLoading(false) }
  }, [status])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (realtimeSignal.type !== 'review_reports.changed') return
    const timer = window.setTimeout(() => void load(true), 250)
    return () => window.clearTimeout(timer)
  }, [load, realtimeSignal.sequence, realtimeSignal.type])

  const moderate = async (report: ModerationReport, action: 'hide' | 'restore' | 'dismiss', moderationNote = '') => {
    setBusy(`${report.reviewId}:${action}`); setError('')
    try {
      const response = await fetch(`/api/admin/reviews/${report.reviewId}/moderate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note: moderationNote }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      setHideTarget(null); setNote('')
      notify(action === 'hide' ? 'Review hidden and reporter notified' : action === 'restore' ? 'Review restored' : 'Report dismissed')
      await load(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The moderation action could not be saved.') }
    finally { setBusy('') }
  }

  return (
    <section className="community-moderation" id="community-reports">
      <header className="community-moderation__heading"><div><p className="eyebrow"><ShieldCheck size={14} /> Community moderation</p><h2>Reported reviews</h2><p>Reports never remove content automatically. Review the context, then make a deliberate decision.</p></div><span>{status === 'open' ? `${reports.length} open` : `${reports.length} ${status}`}</span></header>
      <div className="moderation-tabs" role="tablist" aria-label="Review report status">{(['open', 'resolved', 'dismissed'] as const).map((value) => <button type="button" role="tab" aria-selected={status === value} className={status === value ? 'is-active' : ''} onClick={() => setStatus(value)} key={value}>{value === 'open' ? <Flag /> : value === 'resolved' ? <CheckCircle2 /> : <Eye />} {value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {error && <div className="admin-error"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}
      {loading ? <div className="moderation-loading"><LoaderCircle className="spin" /> Loading reports…</div> : (
        <div className="moderation-list">
          {reports.map((report) => <article className="moderation-card" key={report.id}><header><span className={`moderation-reason moderation-reason--${report.reason}`}><Flag />{reasonLabel(report.reason)}</span><span>{new Date(report.createdAt).toLocaleDateString()}</span></header><div className="moderation-card__meta"><div><small>App</small><strong>{report.appName}</strong></div><div><small>Reported by</small><strong>{report.reporterName}</strong></div><div><small>Review status</small><strong className={`review-state review-state--${report.review.status}`}>{report.review.status}</strong></div></div><blockquote><div><strong>{report.review.userName}</strong><span>{[1, 2, 3, 4, 5].map((value) => <Star key={value} fill={value <= report.review.rating ? 'currentColor' : 'none'} />)}</span></div><h3>{report.review.title}</h3><p>{report.review.body}</p></blockquote>{report.details && <div className="report-context"><strong>Reporter’s context</strong><p>{report.details}</p></div>}{report.resolutionNote && <div className="moderation-resolution"><CheckCircle2 /><span><strong>{report.status} by {report.resolvedBy}</strong>{report.resolutionNote}</span></div>}<footer>{status === 'open' && <><button type="button" className="button button--secondary" onClick={() => void moderate(report, 'dismiss')} disabled={Boolean(busy)}><Eye /> Dismiss report</button><button type="button" className="button button--danger" onClick={() => { setHideTarget(report); setNote('') }} disabled={Boolean(busy)}><EyeOff /> Hide review</button></>}{status === 'resolved' && report.review.status === 'hidden' && <button type="button" className="button button--secondary" onClick={() => void moderate(report, 'restore')} disabled={Boolean(busy)}>{busy ? <LoaderCircle className="spin" /> : <RotateCcw />} Restore review</button>}</footer></article>)}
          {!reports.length && <div className="moderation-empty"><CheckCircle2 /><h3>{status === 'open' ? 'No reports need attention' : `No ${status} reports`}</h3><p>{status === 'open' ? 'The community moderation queue is clear.' : 'Completed decisions will appear here.'}</p></div>}
        </div>
      )}
      {hideTarget && createPortal(<div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHideTarget(null)}><section className="review-dialog moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="hide-review-title"><button type="button" className="auth-close" onClick={() => setHideTarget(null)} aria-label="Close moderation dialog"><X /></button><span className="review-dialog__icon review-dialog__icon--danger"><EyeOff /></span><h2 id="hide-review-title">Hide this review?</h2><p>It will disappear from {hideTarget.appName}. The reviewer receives your reason and cannot edit it unless an Administrator restores it.</p><label className="moderation-note"><span>Reason for the reviewer · Required</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Explain which community standard this review violates…" autoFocus /></label><div className="review-dialog__actions"><button type="button" className="button button--secondary" onClick={() => setHideTarget(null)}>Cancel</button><button type="button" className="button button--danger" onClick={() => void moderate(hideTarget, 'hide', note)} disabled={note.trim().length < 5 || Boolean(busy)}>{busy ? <LoaderCircle className="spin" /> : <EyeOff />} Hide review</button></div></section></div>, document.body)}
    </section>
  )
}

function reasonLabel(reason: string) {
  return ({ spam: 'Spam or promotion', abuse: 'Abusive content', conflict: 'Conflict of interest', other: 'Other concern' } as Record<string, string>)[reason] ?? reason
}
