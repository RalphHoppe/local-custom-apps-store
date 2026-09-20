import { AlertCircle, FileJson, LayoutDashboard, LoaderCircle, Pencil, Plus, Rocket, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'
import type { StoreApp } from '../types'
import { formatDate } from '../utils'

export function ManagePage() {
  const { user, loadManagedApps, submitApp, deleteApp } = useStore()
  const [apps, setApps] = useState<StoreApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StoreApp | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [submittingId, setSubmittingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setApps(await loadManagedApps()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Listings could not be loaded.') }
    finally { setLoading(false) }
  }, [loadManagedApps])
  useEffect(() => { void load() }, [load])

  const submit = async (app: StoreApp) => {
    setSubmittingId(app.id)
    try {
      const updated = await submitApp(app.id)
      setApps((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The listing could not be submitted.') }
    finally { setSubmittingId('') }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true); setDeleteError('')
    try { await deleteApp(deleteTarget.id); setApps((current) => current.filter((app) => app.id !== deleteTarget.id)); setDeleteTarget(null) }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'The listing could not be removed.') }
    finally { setDeleting(false) }
  }

  const isAdmin = user?.role === 'admin'
  return (
    <div className="page manage-page">
      <section className="page-title-row manage-title">
        <div><p className="eyebrow">{isAdmin ? 'Store operations' : 'Your publisher workspace'}</p><h1>{isAdmin ? 'Store listings' : 'Publisher studio'}</h1><p>{isAdmin ? 'Manage every app on the public shelf.' : 'Build drafts, submit them for review, and follow administrator feedback.'}</p></div>
        <div className="manage-heading-actions">{isAdmin && <Link to="/admin" className="button button--secondary button--large"><LayoutDashboard size={18} /> Admin dashboard</Link>}<Link to="/manage/new" className="button button--primary button--large"><Plus size={18} /> Add an app</Link></div>
      </section>

      {!isAdmin && <div className="source-note"><FileJson size={20} /><div><strong>Publishing is reviewed</strong><p>Save your work as a draft, submit when ready, and an administrator will approve it, request changes, or decline it with a reason. Approved versions stay public while revisions are reviewed.</p></div></div>}
      {error && <div className="admin-error"><AlertCircle size={18} /><span>{error}</span><button type="button" onClick={load}>Try again</button></div>}

      {loading ? <AppCardSkeleton count={5} /> : apps.length ? (
        <section className="manage-table-wrap">
          <div className="manage-table-heading"><h2>{isAdmin ? 'All store listings' : 'Your submissions'}</h2><span>{apps.length} total</span></div>
          <div className="manage-table">
            {apps.map((app) => {
              const status = app.submissionStatus ?? 'approved'
              const canSubmit = !isAdmin && ['draft', 'changes_requested', 'declined'].includes(status)
              return (
                <div className="manage-row manage-row--workflow" key={app.id}>
                  <AppIcon app={app} size="small" />
                  <div className="manage-row__name"><strong>{app.name}</strong><span>{app.category} · v{app.version}</span></div>
                  <span className={`status-badge status-badge--${status}`}>{status.replace('_', ' ')}</span>
                  <span className="manage-row__platform">{app.platforms.join(', ')}</span>
                  <span className="manage-row__date">{formatDate(app.updated)}</span>
                  <div className="manage-row__actions">
                    {canSubmit && <button type="button" className="icon-button icon-button--small submit-action" onClick={() => submit(app)} disabled={submittingId === app.id} title="Submit for review">{submittingId === app.id ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}</button>}
                    {(status === 'approved' || app.pendingRelease || isAdmin) && <Link to={`/manage/${app.id}/updates`} className="icon-button icon-button--small update-action" aria-label={`Manage updates for ${app.name}`} title="Manage updates"><Rocket size={16} /></Link>}
                    <Link to={`/manage/${app.id}/edit`} className="icon-button icon-button--small" aria-label={`Edit ${app.name}`} title="Edit listing"><Pencil size={16} /></Link>
                    {(isAdmin || !app.publishedSnapshot) && app.source !== 'catalog' && <button type="button" className="icon-button icon-button--small danger-hover" onClick={() => { setDeleteError(''); setDeleteTarget(app) }} aria-label={`Remove ${app.name}`}><Trash2 size={16} /></button>}
                  </div>
                  {app.reviewNote && ['changes_requested', 'declined'].includes(status) && <div className="review-feedback"><AlertCircle size={15} /><span><strong>{status === 'changes_requested' ? 'Changes requested' : 'Submission declined'}</strong>{app.reviewNote}</span></div>}
                  {app.releaseReviewNote && ['changes_requested', 'declined'].includes(app.releaseSubmissionStatus ?? '') && <div className="review-feedback"><AlertCircle size={15} /><span><strong>Update feedback</strong>{app.releaseReviewNote}</span></div>}
                </div>
              )
            })}
          </div>
        </section>
      ) : <EmptyState title={isAdmin ? 'No listings found' : 'Your studio is empty'} body={isAdmin ? 'Add the first server listing.' : 'Create your first app draft when you’re ready to share something.'} action={<Link to="/manage/new" className="button button--primary"><Plus size={16} /> Add an app</Link>} />}

      {deleteTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><button type="button" className="icon-button confirm-dialog__close" onClick={() => setDeleteTarget(null)}><X size={18} /></button><div className="state-icon state-icon--error"><AlertCircle /></div><h2 id="delete-title">Remove {deleteTarget.name}?</h2><p>This removes the draft and all files stored for it. Published apps can only be removed by an administrator.</p>{deleteError && <p className="confirm-error">{deleteError}</p>}<div className="confirm-dialog__actions"><button type="button" className="button button--secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Keep it</button><button type="button" className="button button--danger" onClick={confirmDelete} disabled={deleting}>{deleting ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} Remove listing</button></div></section></div>}
    </div>
  )
}
