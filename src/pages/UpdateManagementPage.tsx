import { ArrowLeft, CalendarDays, CheckCircle2, Download, FileArchive, History, Info, Link2, LoaderCircle, Rocket, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'
import type { StoreApp } from '../types'
import { formatDate } from '../utils'

function suggestVersion(version: string) {
  const pieces = version.split('.').map(Number)
  if (pieces.length >= 3 && pieces.every(Number.isFinite)) return `${pieces[0]}.${pieces[1]}.${pieces[2] + 1}`
  return ''
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

export function UpdateManagementPage() {
  const { appId } = useParams()
  const { user, getManagedApp, publishUpdate, deleteRelease } = useStore()
  const [app, setApp] = useState<StoreApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [size, setSize] = useState('')
  const [source, setSource] = useState<'upload' | 'url'>('upload')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [releaseFile, setReleaseFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!appId) return
    let active = true
    setLoading(true)
    getManagedApp(appId)
      .then((listing) => { if (active) setApp(listing) })
      .catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'The app could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [appId, getManagedApp])

  useEffect(() => {
    if (!app) return
    const pending = app.pendingRelease
    setVersion(pending?.version ?? suggestVersion(app.version))
    setDate(pending?.date ?? new Date().toISOString().slice(0, 10))
    setNotes(pending?.notes.join('\n') ?? '')
    setDownloadUrl(pending?.downloadUrl && /^https?:\/\//.test(pending.downloadUrl) ? pending.downloadUrl : '')
    setSource(pending?.downloadUrl && /^https?:\/\//.test(pending.downloadUrl) ? 'url' : 'upload')
    setSize((pending?.size ?? app.size) === 'Web app' ? '' : pending?.size ?? app.size)
  }, [app])

  if (loading) return <div className="page"><AppCardSkeleton count={4} /></div>
  if (!app) return <div className="page page--centered"><EmptyState title="App not found" body={loadError || 'The app may have been removed.'} action={<Link to="/manage" className="button button--primary">Back to manage</Link>} /></div>

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReleaseFile(file)
    setSize(formatBytes(file.size))
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const releaseNotes = notes.split('\n').map((item) => item.trim()).filter(Boolean)
    if (!version.trim()) { setError('Add a version number for this update.'); return }
    if (!releaseNotes.length) { setError('Add at least one release note.'); return }
    if (app.delivery === 'download' && source === 'upload' && !releaseFile) { setError('Choose the new app file.'); return }
    if (app.delivery === 'download' && source === 'url' && !downloadUrl.trim()) { setError('Add the new download URL.'); return }

    setSaving(true)
    setError('')
    try {
      const saved = await publishUpdate(app.id, {
        version: version.trim(), date, notes: releaseNotes, size: size.trim(),
        downloadUrl: source === 'url' ? downloadUrl.trim() : undefined,
        releaseFile: source === 'upload' ? releaseFile ?? undefined : undefined,
      })
      setApp(saved)
      if (user?.role === 'admin') {
        setVersion(suggestVersion(saved.version))
        setNotes('')
        setDownloadUrl('')
      }
      setReleaseFile(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The update could not be published.')
    } finally {
      setSaving(false)
    }
  }

  const removeRelease = async (releaseId: string) => {
    setDeletingId(releaseId)
    setError('')
    try {
      await deleteRelease(app.id, releaseId)
      setApp((current) => current ? { ...current, releases: current.releases?.filter((release) => release.id !== releaseId) } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The update could not be removed.')
    } finally {
      setDeletingId('')
    }
  }

  const awaitingReview = user?.role !== 'admin' && app.releaseSubmissionStatus === 'pending'
  const needsChanges = user?.role !== 'admin' && ['changes_requested', 'declined'].includes(app.releaseSubmissionStatus ?? '')

  return (
    <div className="page updates-page">
      <Link to="/manage" className="back-link"><ArrowLeft size={17} /> Back to manage</Link>
      <section className="update-header">
        <AppIcon app={app} size="large" />
        <div><p className="eyebrow">Release management</p><h1>{app.name}</h1><p>{user?.role === 'admin' ? 'Publish new versions and keep a clean update history.' : 'Submit version updates for administrator review.'}</p></div>
        <div className="current-version"><span><CheckCircle2 size={14} /> Live now</span><strong>v{app.version}</strong><small>Updated {formatDate(app.updated)}</small></div>
      </section>

      {(awaitingReview || needsChanges) && <div className={`update-review-banner ${needsChanges ? 'is-warning' : ''}`}><Info size={18} /><span><strong>{awaitingReview ? `Version ${app.pendingRelease?.version} is waiting for review.` : 'The administrator sent feedback on this update.'}</strong>{needsChanges ? app.releaseReviewNote : 'The currently approved version stays live until this update is approved.'}</span></div>}
      <div className="updates-layout">
        <form className={`release-form ${awaitingReview ? 'is-locked' : ''}`} onSubmit={submit}>
          <div className="release-form__heading"><span><Rocket size={18} /></span><div><h2>{user?.role === 'admin' ? 'Publish an update' : needsChanges ? 'Revise update' : 'Submit an update'}</h2><p>{user?.role === 'admin' ? 'The new version becomes the store’s active download immediately.' : 'An administrator must approve it before anything changes publicly.'}</p></div></div>
          {error && <div className="form-error-summary"><Info size={18} /><span><strong>{error}</strong></span></div>}
          <div className="field-row field-row--two">
            <label className="field"><span className="field__label">Version <small>Required</small></span><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="2.4.2" /></label>
            <label className="field"><span className="field__label">Release date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          </div>

          {app.delivery === 'download' && (
            <>
              <div className="upload-source-tabs" role="group" aria-label="Choose update file source">
                <button type="button" className={source === 'upload' ? 'is-active' : ''} onClick={() => { setSource('upload'); setError('') }}><UploadCloud size={16} /> Upload new file</button>
                <button type="button" className={source === 'url' ? 'is-active' : ''} onClick={() => { setSource('url'); setError('') }}><Link2 size={16} /> Use a URL</button>
              </div>
              {source === 'upload' ? (
                <div className="field">
                  <span className="field__label">Release file <small>Required · up to 2 GB</small></span>
                  <input ref={fileInputRef} className="native-file-input" hidden aria-hidden="true" tabIndex={-1} type="file" onChange={chooseFile} />
                  {releaseFile ? (
                    <div className="selected-file"><span className="selected-file__icon"><FileArchive size={22} /></span><span><strong>{releaseFile.name}</strong><small>{formatBytes(releaseFile.size)}</small></span><button type="button" className="button button--secondary" onClick={() => fileInputRef.current?.click()}>Replace</button></div>
                  ) : (
                    <button type="button" className="file-drop" onClick={() => fileInputRef.current?.click()}><span className="upload-drop__icon"><UploadCloud size={23} /></span><span className="upload-drop__copy"><strong>Choose the updated app file</strong><small>The previous release remains in update history</small></span></button>
                  )}
                </div>
              ) : (
                <label className="field"><span className="field__label">Download URL <small>Required</small></span><input value={downloadUrl} onChange={(event) => setDownloadUrl(event.target.value)} placeholder="https://downloads.example/app-v2.zip" /></label>
              )}
              <label className="field"><span className="field__label">Download size</span><input value={size} onChange={(event) => setSize(event.target.value)} placeholder="52 MB" /></label>
            </>
          )}

          <label className="field"><span className="field__label">What’s new <small>One item per line</small></span><textarea rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={'A faster startup\nNew keyboard shortcuts\nFixed export issue'} /></label>
          <button type="submit" className="button button--primary button--large button--full" disabled={saving || awaitingReview}>{saving ? <LoaderCircle className="spin" size={18} /> : <Rocket size={18} />} {saving ? 'Submitting…' : awaitingReview ? 'Waiting for administrator review' : user?.role === 'admin' ? `Publish ${version ? `v${version}` : 'update'}` : `Submit ${version ? `v${version}` : 'update'} for review`}</button>
        </form>

        <section className="release-history">
          <div className="release-history__heading"><div><span><History size={18} /></span><div><h2>Update history</h2><p>{app.releases?.length ?? 0} version{app.releases?.length === 1 ? '' : 's'} in history</p></div></div></div>
          {app.releases?.length ? (
            <div className="release-list">
              {app.releases.map((release, index) => (
                <article className="release-item" key={release.id}>
                  <div className="release-item__rail"><i /><span /></div>
                  <div className="release-item__body">
                    <div className="release-item__top"><div><strong>Version {release.version}</strong>{index === 0 && <span className="live-badge">Live</span>}</div><time><CalendarDays size={13} /> {formatDate(release.date)}</time></div>
                    <ul>{release.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                    <div className="release-item__footer"><span>{release.size || app.size}</span>{release.downloadUrl && <a href={release.downloadUrl} download={release.uploadedFileName ?? ''}><Download size={14} /> Download build</a>}{index > 0 && <button type="button" onClick={() => removeRelease(release.id)} disabled={deletingId === release.id}>{deletingId === release.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Remove</button>}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="release-empty"><History size={26} /><h3>No managed updates yet</h3><p>The current version is live. Your first update published here will begin the release history.</p></div>
          )}
        </section>
      </div>
    </div>
  )
}
