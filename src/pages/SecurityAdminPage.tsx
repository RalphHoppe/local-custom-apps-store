import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileKey2,
  Fingerprint,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppIcon } from '../components/AppIcon'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'
import type { Accent, AppSecurityProfile } from '../types'

interface AdminSecurityReport extends AppSecurityProfile {
  app: { id: string; name: string; icon: string; accent: Accent; iconImage?: string }
  ownerName: string
  listingStatus: string
  publicBuild: boolean
}

interface SecurityPayload {
  generatedAt: string
  scanner: { name: string; version: string; mode: string }
  totals: { builds: number; passed: number; attention: number; external: number }
  reports: AdminSecurityReport[]
}

function compactBytes(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function AdminSecurityPage() {
  const { notify, realtimeSignal } = useStore()
  const [payload, setPayload] = useState<SecurityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'attention' | 'passed' | 'external'>('all')
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<AdminSecurityReport | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/security')
      if (!response.ok) throw new Error(await getResponseError(response))
      setPayload(await response.json() as SecurityPayload)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Security reports could not be loaded.') }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (realtimeSignal.type === 'security.changed') void load(true) }, [load, realtimeSignal.sequence, realtimeSignal.type])

  const reports = useMemo(() => (payload?.reports ?? []).filter((report) => {
    const matchesQuery = [report.appName, report.version, report.ownerName, report.fileName, report.scanStatus, report.source].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'all'
      || (filter === 'attention' && ['warning', 'blocked', 'unavailable'].includes(report.scanStatus))
      || (filter === 'passed' && report.scanStatus === 'passed')
      || (filter === 'external' && report.source === 'external')
    return matchesQuery && matchesFilter
  }), [filter, payload?.reports, query])

  const rescan = async (report: AdminSecurityReport) => {
    setBusy(report.reportId); setError('')
    try {
      const response = await fetch(`/api/admin/security/${encodeURIComponent(report.reportId)}/rescan`, { method: 'POST' })
      if (!response.ok) throw new Error(await getResponseError(response))
      const updated = await response.json() as AppSecurityProfile
      setPayload((current) => current ? { ...current, reports: current.reports.map((item) => item.reportId === report.reportId ? { ...item, ...updated } : item) } : current)
      setSelected((current) => current?.reportId === report.reportId ? { ...current, ...updated } : current)
      notify(`${report.appName} ${report.version} re-scanned`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The build could not be re-scanned.') }
    finally { setBusy('') }
  }

  const rescanAll = async () => {
    setBusy('all'); setError('')
    try {
      const response = await fetch('/api/admin/security/rescan-all', { method: 'POST' })
      if (!response.ok) throw new Error(await getResponseError(response))
      setPayload(await response.json() as SecurityPayload)
      notify('All current builds were re-scanned')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The security scan could not be completed.') }
    finally { setBusy('') }
  }

  if (loading) return <div className="admin-content"><AppCardSkeleton count={5} /></div>

  return (
    <div className="admin-content security-admin-page">
      <section className="admin-section-title">
        <div><p className="eyebrow">Build provenance & integrity</p><h2>Trust center</h2><p>Review checksums, focused local validation, signature declarations, permissions, and stored-file integrity.</p></div>
        <button type="button" className="button button--primary" onClick={() => void rescanAll()} disabled={busy === 'all'}>{busy === 'all' ? <LoaderCircle className="spin" /> : <RefreshCw />} Re-scan all</button>
      </section>
      {error && <div className="admin-error"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw /> Retry</button></div>}

      {payload && <section className="security-metric-grid">
        <article><span><Fingerprint /></span><div><strong>{payload.totals.builds}</strong><small>Tracked builds</small></div></article>
        <article className="is-good"><span><ShieldCheck /></span><div><strong>{payload.totals.passed}</strong><small>Checks passed</small></div></article>
        <article className={payload.totals.attention ? 'is-attention' : 'is-good'}><span>{payload.totals.attention ? <AlertTriangle /> : <CheckCircle2 />}</span><div><strong>{payload.totals.attention}</strong><small>Need attention</small></div></article>
        <article><span><ExternalLink /></span><div><strong>{payload.totals.external}</strong><small>External builds</small></div></article>
      </section>}

      {payload && <div className="security-scanner-note"><ShieldQuestion /><span><strong>{payload.scanner.name} {payload.scanner.version}</strong><small>Checks integrity, file format, and a focused set of unsafe patterns locally. It does not make an antivirus guarantee.</small></span><i>Local adapter</i></div>}

      <div className="admin-toolbar security-toolbar"><div className="inline-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search app, owner, version…" /></div><div className="admin-filter-tabs">{(['all', 'attention', 'passed', 'external'] as const).map((value) => <button type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></div>

      <section className="security-report-list">
        <div className="security-report-head"><span>Build</span><span>Source</span><span>Validation</span><span>Integrity</span><span>Permissions</span><span>Action</span></div>
        {reports.map((report) => {
          const attention = ['warning', 'blocked', 'unavailable'].includes(report.scanStatus)
          return <article className={`security-report-row ${attention ? 'is-attention' : ''}`} key={report.reportId}>
            <button type="button" className="security-build-cell" onClick={() => setSelected(report)}><AppIcon app={{ name: report.app.name, icon: report.app.icon, accent: report.app.accent, iconImage: report.app.iconImage }} size="small" /><span><strong>{report.appName} <i>v{report.version}</i></strong><small>{report.ownerName} · {report.fileName || 'Web app'}</small></span></button>
            <span className={`security-source security-source--${report.source}`}>{report.source}</span>
            <span className={`security-status security-status--${report.scanStatus}`}>{report.scanStatus === 'passed' ? <CheckCircle2 /> : attention ? <AlertTriangle /> : <Info />}{statusLabel(report.scanStatus)}</span>
            <span className={`security-status security-status--${report.integrityStatus}`}>{report.integrityStatus === 'verified' ? <Check /> : report.integrityStatus === 'changed' ? <AlertTriangle /> : <Info />}{statusLabel(report.integrityStatus)}</span>
            <span className="security-permission-count"><LockKeyhole /> {report.permissionCount}</span>
            <button type="button" className="mini-action" onClick={() => void rescan(report)} disabled={busy === report.reportId}>{busy === report.reportId ? <LoaderCircle className="spin" /> : <RefreshCw />} Re-scan</button>
          </article>
        })}
        {!reports.length && <EmptyState title="No matching security reports" body="Try another search or report filter." />}
      </section>

      {selected && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="security-report-dialog" role="dialog" aria-modal="true" aria-labelledby="security-report-title"><button type="button" className="auth-close" onClick={() => setSelected(null)} aria-label="Close"><X /></button><header><AppIcon app={{ name: selected.app.name, icon: selected.app.icon, accent: selected.app.accent, iconImage: selected.app.iconImage }} size="large" /><div><p className="eyebrow">Security report · Version {selected.version}</p><h2 id="security-report-title">{selected.appName}</h2><small>{selected.ownerName} · {selected.fileName || 'Web app'} · {compactBytes(selected.fileSize)}</small></div></header><div className="security-dialog-states"><span className={`security-status security-status--${selected.scanStatus}`}><ShieldCheck /> Validation: {statusLabel(selected.scanStatus)}</span><span className={`security-status security-status--${selected.integrityStatus}`}><Fingerprint /> Integrity: {statusLabel(selected.integrityStatus)}</span><span><LockKeyhole /> {selected.permissionCount} permissions</span></div>{selected.sha256 && <SecurityValue label="SHA-256" value={selected.sha256} copy />}{selected.signature ? <div className="security-signature-detail"><FileKey2 /><span><small>Publisher-declared signature</small><strong>{selected.signature.signer}</strong><code>{selected.signature.fingerprint || selected.signature.type.replaceAll('_', ' ')}</code></span></div> : <div className="security-dialog-empty"><FileKey2 /> No signature metadata provided.</div>}<div className="security-dialog-columns"><section><h3>Declared permissions</h3>{selected.permissionDetails.length ? selected.permissionDetails.map((permission) => <div className="security-dialog-item" key={permission.id}><LockKeyhole /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></div>) : <div className="security-dialog-empty"><CheckCircle2 /> No special permissions declared.</div>}</section><section><h3>Validator findings</h3>{selected.findings.length ? selected.findings.map((finding) => <div className={`security-dialog-item finding--${finding.severity}`} key={finding.code}>{finding.severity === 'info' ? <Info /> : <AlertTriangle />}<span><strong>{finding.title}</strong><small>{finding.detail}</small></span></div>) : <div className="security-dialog-empty"><CheckCircle2 /> Nothing flagged by focused checks.</div>}</section></div><footer><span>Scanned {selected.scannedAt ? new Date(selected.scannedAt).toLocaleString() : 'never'} · {selected.scanner} {selected.scannerVersion}</span><button type="button" className="button button--primary" onClick={() => void rescan(selected)} disabled={busy === selected.reportId}>{busy === selected.reportId ? <LoaderCircle className="spin" /> : <RefreshCw />} Re-scan build</button></footer></section></div>}
    </div>
  )
}

function SecurityValue({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const { notify } = useStore()
  const [copied, setCopied] = useState(false)
  const doCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true); notify(`${label} copied`); window.setTimeout(() => setCopied(false), 1600)
  }
  return <div className="security-value"><span>{label}</span><code>{value}</code>{copy && <button type="button" onClick={() => void doCopy()}>{copied ? <Check /> : <Clipboard />}{copied ? 'Copied' : 'Copy'}</button>}</div>
}
