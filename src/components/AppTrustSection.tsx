import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileCheck2,
  FileKey2,
  Fingerprint,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AppSecurityProfile, StoreApp, TrustBadge } from '../types'
import { getResponseError, useStore } from '../store/StoreContext'

function compactBytes(bytes: number | null) {
  if (bytes == null) return 'Size reported by source'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function signatureLabel(type: string) {
  return ({ authenticode: 'Microsoft Authenticode', apple_developer_id: 'Apple Developer ID', android: 'Android app signing', gpg: 'GPG / detached signature', other: 'Other signing method' } as Record<string, string>)[type] ?? type
}

function BadgeIcon({ badge }: { badge: TrustBadge }) {
  if (badge.id === 'checksum') return <Fingerprint />
  if (badge.id === 'signature') return <FileKey2 />
  if (badge.id === 'permissions') return <LockKeyhole />
  return <ShieldCheck />
}

export function AppTrustSection({ app }: { app: StoreApp }) {
  const { notify, realtimeSignal } = useStore()
  const [profile, setProfile] = useState<AppSecurityProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/security?version=${encodeURIComponent(app.version)}`)
      if (!response.ok) throw new Error(await getResponseError(response))
      setProfile(await response.json() as AppSecurityProfile)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Trust details could not be loaded.')
    } finally { if (!silent) setLoading(false) }
  }, [app.id, app.version])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (realtimeSignal.type === 'security.changed' && (!realtimeSignal.appId || realtimeSignal.appId === app.id)) void load(true)
  }, [app.id, load, realtimeSignal.appId, realtimeSignal.sequence, realtimeSignal.type])

  const verify = async () => {
    setVerifying(true); setError('')
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/security/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: app.version }),
      })
      const body = await response.json() as AppSecurityProfile | { error?: string }
      if ('appId' in body) {
        setProfile(body)
        if (!response.ok) { notify('Integrity check found a mismatch — download paused', 'error'); return }
      } else if (!response.ok) throw new Error(body.error || 'The integrity check could not be completed.')
      notify('Hosted file matches its recorded SHA-256 checksum')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The integrity check could not be completed.') }
    finally { setVerifying(false) }
  }

  const copyChecksum = async () => {
    if (!profile?.sha256) return
    try {
      await navigator.clipboard.writeText(profile.sha256)
      setCopied(true); notify('SHA-256 checksum copied')
      window.setTimeout(() => setCopied(false), 1800)
    } catch { notify('The checksum could not be copied.', 'error') }
  }

  if (loading) return <section className="app-trust-section app-trust-section--loading"><div className="trust-loading-line" /><div className="trust-loading-grid"><i /><i /><i /></div></section>
  if (error && !profile) return <section className="app-trust-section app-trust-section--error"><ShieldQuestion /><span><strong>Trust details are temporarily unavailable</strong><small>{error}</small></span><button type="button" onClick={() => void load()}><RefreshCw /> Retry</button></section>
  if (!profile) return null

  const needsAttention = ['warning', 'blocked', 'unavailable'].includes(profile.scanStatus) || profile.integrityStatus === 'changed'
  const external = profile.source === 'external'
  const web = profile.source === 'web'
  const title = needsAttention ? 'This build needs attention' : external ? 'Publisher provenance is available' : web ? 'Permission details, before you open it' : 'This build passed Local’s checks'
  const subtitle = needsAttention
    ? 'Review the findings below. Downloads are paused when integrity no longer matches.'
    : external ? 'Local publishes the declared checksum without fetching the external file.'
      : web ? 'There is no installer to scan, so this page focuses on declared access.'
        : 'Its SHA-256 checksum and local validation result are recorded for this exact version.'

  return (
    <section className={`app-trust-section ${needsAttention ? 'is-attention' : ''}`} id="trust">
      <header className="app-trust-header">
        <span className="app-trust-header__icon">{needsAttention ? <AlertTriangle /> : <ShieldCheck />}</span>
        <div><p className="section-kicker">Trust & safety · Version {profile.version}</p><h2>{title}</h2><small>{subtitle}</small></div>
        <span className={`scan-state scan-state--${profile.scanStatus}`}>{profile.scanStatus === 'passed' ? <CheckCircle2 /> : profile.scanStatus === 'not_applicable' ? <Info /> : needsAttention ? <AlertTriangle /> : <ShieldQuestion />}{profile.scanStatus.replaceAll('_', ' ')}</span>
      </header>

      {profile.badges.length > 0 && <div className="trust-badges">{profile.badges.map((badge) => <span className={`trust-badge trust-badge--${badge.tone}`} key={badge.id}><BadgeIcon badge={badge} /> {badge.label}</span>)}</div>}

      <div className="trust-fact-grid">
        <article className="trust-fact-card">
          <span><Fingerprint /></span><div><small>SHA-256 checksum</small><strong>{profile.sha256 ? `${profile.sha256.slice(0, 12)}…${profile.sha256.slice(-8)}` : 'Not available'}</strong><p>{profile.fileName || (web ? 'No installer for web apps' : 'Build file')} · {compactBytes(profile.fileSize)}</p></div>
          {profile.sha256 && <button type="button" onClick={() => void copyChecksum()} aria-label="Copy SHA-256 checksum">{copied ? <Check /> : <Clipboard />}</button>}
        </article>
        <article className="trust-fact-card">
          <span><FileCheck2 /></span><div><small>Local validation</small><strong>{profile.scanStatus === 'passed' ? 'Focused checks passed' : profile.scanStatus === 'not_scanned' ? 'Not scanned by Local' : profile.scanStatus === 'not_applicable' ? 'No file to scan' : profile.scanStatus.replaceAll('_', ' ')}</strong><p>{profile.scannedAt ? `${profile.scanner} ${profile.scannerVersion} · ${new Date(profile.scannedAt).toLocaleString()}` : 'No scan timestamp'}</p></div>
        </article>
        <article className="trust-fact-card">
          <span><FileKey2 /></span><div><small>Build signature</small><strong>{profile.signature ? profile.signature.signer : 'Not provided'}</strong><p>{profile.signature ? `${signatureLabel(profile.signature.type)} · Publisher-provided` : 'No signing metadata was declared'}</p></div>
        </article>
      </div>

      {profile.sha256 && <div className="full-checksum"><span>Full SHA-256</span><code>{profile.sha256}</code><button type="button" onClick={() => void copyChecksum()}>{copied ? <Check /> : <Clipboard />}{copied ? 'Copied' : 'Copy'}</button></div>}
      {profile.signature?.fingerprint && <div className="signature-fingerprint"><FileKey2 /><span><small>Declared certificate fingerprint</small><code>{profile.signature.fingerprint}</code></span></div>}

      <div className="trust-detail-grid">
        <section className="permission-disclosure">
          <div><p className="section-kicker">Declared access</p><h3>{profile.permissions.length ? `${profile.permissions.length} permission${profile.permissions.length === 1 ? '' : 's'}` : 'No special permissions declared'}</h3></div>
          {profile.permissionDetails.length ? <div>{profile.permissionDetails.map((permission) => <article key={permission.id}><LockKeyhole /><span><strong>{permission.label}</strong><small>{permission.description}</small></span></article>)}</div> : <p className="permission-empty"><CheckCircle2 /> The Publisher says this app does not request the capabilities listed by Local.</p>}
        </section>
        <section className="scan-findings">
          <div><p className="section-kicker">Validator notes</p><h3>{profile.findings.length ? `${profile.findings.length} finding${profile.findings.length === 1 ? '' : 's'}` : 'Nothing flagged'}</h3></div>
          {profile.findings.length ? <div>{profile.findings.map((finding) => <article className={`finding finding--${finding.severity}`} key={finding.code}>{finding.severity === 'blocked' || finding.severity === 'warning' ? <AlertTriangle /> : <Info />}<span><strong>{finding.title}</strong><small>{finding.detail}</small></span></article>)}</div> : <p className="finding-empty"><CheckCircle2 /> File format and focused unsafe-pattern checks completed without a finding.</p>}
        </section>
      </div>

      <footer className="trust-footer">
        <p>{profile.disclosure}</p>
        {profile.canVerify && <button type="button" className="button button--secondary" onClick={() => void verify()} disabled={verifying}>{verifying ? <LoaderCircle className="spin" /> : <RefreshCw />} {verifying ? 'Verifying file…' : 'Verify stored file now'}</button>}
        {external && app.downloadUrl && <a className="button button--secondary" href={app.downloadUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open external source</a>}
      </footer>
      {error && <div className="trust-inline-error"><AlertTriangle /> {error}</div>}
    </section>
  )
}
