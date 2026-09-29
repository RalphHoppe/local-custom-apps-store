import {
  AlertTriangle,
  AppWindow,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  ShieldOff,
  Store,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import { ReviewModerationPanel } from '../components/ReviewModerationPanel'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'
import type { EditorialCollection, StoreApp, UserAccount, UserRole } from '../types'
import { formatDate } from '../utils'

const adminNav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/reviews', label: 'Review queue', icon: FileCheck2 },
  { to: '/admin/apps', label: 'All listings', icon: AppWindow },
  { to: '/admin/editorial', label: 'Editorial', icon: BookOpen },
  { to: '/admin/security', label: 'Trust', icon: Fingerprint },
  { to: '/admin/system', label: 'System', icon: Database },
]

export function AdminShell() {
  const { user } = useStore()
  return (
    <div className="admin-area">
      <section className="admin-top">
        <div><p className="eyebrow"><ShieldCheck size={14} /> Administrator workspace</p><h1>Store management</h1><p>Welcome back, {user?.displayName}. Review people, publishing, and the public shelf.</p></div>
        <div className="admin-secure"><ShieldCheck size={18} /><span><strong>Administrator session</strong><small>Full store permissions</small></span></div>
      </section>
      <nav className="admin-tabs" aria-label="Administration sections">
        {adminNav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon size={16} />{label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  )
}

function useAdminData() {
  const [users, setUsers] = useState<UserAccount[]>([])
  const [apps, setApps] = useState<StoreApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [usersResponse, appsResponse] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/apps')])
      if (!usersResponse.ok) throw new Error(await getResponseError(usersResponse))
      if (!appsResponse.ok) throw new Error(await getResponseError(appsResponse))
      setUsers(await usersResponse.json() as UserAccount[])
      setApps(await appsResponse.json() as StoreApp[])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Management data could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return { users, setUsers, apps, setApps, loading, error, load }
}

export function AdminOverviewPage() {
  const { users, apps, loading, error, load } = useAdminData()
  if (loading) return <div className="admin-loading"><AppCardSkeleton count={4} /></div>
  const pendingUsers = users.filter((user) => user.status === 'pending')
  const listingReviews = apps.filter((app) => app.submissionStatus === 'pending')
  const updateReviews = apps.filter((app) => app.releaseSubmissionStatus === 'pending')
  const published = apps.filter((app) => (app.submissionStatus ?? 'approved') === 'approved')

  return (
    <div className="admin-content">
      {error && <AdminError message={error} retry={load} />}
      <section className="metric-grid">
        <MetricCard label="Pending accounts" value={pendingUsers.length} icon={<UserCheck />} tone="amber" to="/admin/users" />
        <MetricCard label="Listing reviews" value={listingReviews.length} icon={<FileCheck2 />} tone="violet" to="/admin/reviews" />
        <MetricCard label="Update reviews" value={updateReviews.length} icon={<Rocket />} tone="blue" to="/admin/reviews" />
        <MetricCard label="Published apps" value={published.length} icon={<Store />} tone="green" to="/admin/apps" />
      </section>
      <div className="admin-overview-grid">
        <section className="admin-card">
          <div className="admin-card__heading"><div><span>Needs attention</span><h2>Review queue</h2></div><Link to="/admin/reviews">Open queue <ArrowRight size={15} /></Link></div>
          {[...listingReviews.map((app) => ({ app, type: 'New listing' })), ...updateReviews.map((app) => ({ app, type: 'Version update' }))].slice(0, 5).map(({ app, type }) => (
            <Link className="attention-row" to="/admin/reviews" key={`${type}-${app.id}`}><AppIcon app={app} size="small" /><span><strong>{app.name}</strong><small>{type} · by {app.ownerName || 'Store catalog'}</small></span><Clock3 size={16} /></Link>
          ))}
          {!listingReviews.length && !updateReviews.length && <div className="admin-empty-small"><CheckCircle2 size={21} /><span><strong>Queue is clear</strong><small>No app submissions are waiting.</small></span></div>}
        </section>
        <section className="admin-card">
          <div className="admin-card__heading"><div><span>New registrations</span><h2>Account requests</h2></div><Link to="/admin/users">Manage users <ArrowRight size={15} /></Link></div>
          {pendingUsers.slice(0, 5).map((account) => <Link className="attention-row" to="/admin/users" key={account.id}><div className="user-avatar">{account.displayName.slice(0, 2).toUpperCase()}</div><span><strong>{account.displayName}</strong><small>@{account.username} · requested {account.requestedRole}</small></span><Clock3 size={16} /></Link>)}
          {!pendingUsers.length && <div className="admin-empty-small"><CheckCircle2 size={21} /><span><strong>Everyone reviewed</strong><small>No account requests are waiting.</small></span></div>}
        </section>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, tone, to }: { label: string; value: number; icon: ReactNode; tone: string; to: string }) {
  return <Link className={`metric-card metric-card--${tone}`} to={to}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div><ArrowRight size={16} /></Link>
}

export function AdminUsersPage() {
  const { users, setUsers, loading, error, load } = useAdminData()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [decision, setDecision] = useState<{ user: UserAccount; action: string } | null>(null)
  const [note, setNote] = useState('')
  const [role, setRole] = useState<UserRole>('member')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const filtered = users.filter((user) => (status === 'all' || user.status === status) && [user.displayName, user.username, user.email, user.role].join(' ').toLowerCase().includes(query.toLowerCase()))

  const openDecision = (account: UserAccount, action: string) => { setDecision({ user: account, action }); setNote(''); setRole(account.requestedRole === 'admin' ? 'member' : account.requestedRole); setActionError('') }
  const apply = async () => {
    if (!decision) return
    setBusy(true); setActionError('')
    try {
      const publisherVerification = ['verify_publisher', 'unverify_publisher'].includes(decision.action)
      const response = await fetch(`/api/admin/users/${decision.user.id}${publisherVerification ? '/publisher-verification' : ''}`, { method: publisherVerification ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(publisherVerification ? { verified: decision.action === 'verify_publisher', note } : { action: decision.action, note, role }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      if (response.status === 204) setUsers((current) => current.filter((user) => user.id !== decision.user.id))
      else {
        const updated = await response.json() as UserAccount
        setUsers((current) => current.map((user) => user.id === updated.id ? updated : user))
      }
      setDecision(null)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The account could not be updated.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="admin-content"><AppCardSkeleton count={6} /></div>
  return (
    <div className="admin-content">
      <section className="admin-section-title"><div><p className="eyebrow">People & permissions</p><h2>User management</h2><p>Review registration requests, assign roles, and control account access.</p></div><span>{users.length} {users.length === 1 ? 'account' : 'accounts'}</span></section>
      {error && <AdminError message={error} retry={load} />}
      <div className="admin-toolbar"><div className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people…" /></div><div className="admin-filter-tabs">{['all', 'pending', 'approved', 'declined', 'suspended'].map((item) => <button type="button" className={status === item ? 'is-active' : ''} onClick={() => setStatus(item)} key={item}>{item}</button>)}</div></div>
      <section className="admin-table-card">
        <div className="user-table user-table--head"><span>User</span><span>Requested</span><span>Current role</span><span>Status</span><span>Joined</span><span>Actions</span></div>
        {filtered.map((account) => (
          <div className="user-table" key={account.id}>
            <div className="user-cell"><div className="user-avatar">{account.displayName.slice(0, 2).toUpperCase()}</div><span><strong>{account.displayName}</strong><small>@{account.username} · {account.email} · {account.emailVerified ? 'email verified' : 'email unverified'}</small></span></div>
            <span className="table-secondary">{account.requestedRole}</span><span className="role-badge">{account.role}</span><StatusBadge status={account.status} /><span className="table-secondary">{formatDate(account.createdAt.slice(0, 10))}</span>
            <div className="row-actions">
              {account.status === 'pending' && <><button type="button" className="mini-action mini-action--approve" onClick={() => openDecision(account, 'approve')}><Check size={14} /> Approve</button><button type="button" className="mini-action" onClick={() => openDecision(account, 'decline')}><X size={14} /></button></>}
              {account.status === 'approved' && !account.isBootstrapAdmin && <><button type="button" className="mini-action" onClick={() => openDecision(account, 'change_role')}><UserCog size={14} /> Role</button>{account.role === 'publisher' && <button type="button" className={`mini-action ${account.publisherVerified ? '' : 'mini-action--approve'}`} onClick={() => openDecision(account, account.publisherVerified ? 'unverify_publisher' : 'verify_publisher')}><ShieldCheck size={14} /> {account.publisherVerified ? 'Unverify' : 'Verify'}</button>}<button type="button" className="mini-action" onClick={() => openDecision(account, 'suspend')}><ShieldOff size={14} /></button></>}
              {['declined', 'suspended'].includes(account.status) && <button type="button" className="mini-action mini-action--approve" onClick={() => openDecision(account, 'reactivate')}><RefreshCw size={14} /> Reactivate</button>}
              {!account.isBootstrapAdmin && <button type="button" className="mini-action mini-action--danger" onClick={() => openDecision(account, 'delete')}><Trash2 size={14} /></button>}
            </div>
          </div>
        ))}
        {!filtered.length && <EmptyState title="No matching accounts" body="Try another search or status filter." />}
      </section>
      {decision && <DecisionDialog title={decisionTitle(decision.action, decision.user.displayName)} action={decision.action} note={note} setNote={setNote} role={role} setRole={setRole} error={actionError} busy={busy} close={() => setDecision(null)} confirm={apply} />}
    </div>
  )
}

function decisionTitle(action: string, name: string) {
  return ({ approve: `Approve ${name}`, decline: `Decline ${name}`, suspend: `Suspend ${name}`, reactivate: `Reactivate ${name}`, change_role: `Change ${name}’s role`, verify_publisher: `Verify ${name}`, unverify_publisher: `Remove ${name}’s verification`, delete: `Delete ${name}` } as Record<string, string>)[action]
}

function DecisionDialog({ title, action, note, setNote, role, setRole, error, busy, close, confirm }: { title: string; action: string; note: string; setNote: (value: string) => void; role: UserRole; setRole: (value: UserRole) => void; error: string; busy: boolean; close: () => void; confirm: () => void }) {
  const needsReason = ['decline', 'suspend'].includes(action)
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="admin-decision" role="dialog" aria-modal="true"><button type="button" className="auth-close" onClick={close}><X size={18} /></button><div className={`decision-icon ${['decline', 'suspend', 'delete'].includes(action) ? 'is-danger' : ''}`}>{['approve', 'reactivate'].includes(action) ? <UserCheck /> : action === 'change_role' ? <UserCog /> : <AlertTriangle />}</div><h2>{title}</h2><p>{action === 'delete' ? 'This permanently removes the account and all active sessions.' : 'The account holder will see the status and your message when they sign in.'}</p>{['approve', 'change_role'].includes(action) && <label className="admin-field"><span>Assigned role</span><select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="member">Member</option><option value="publisher">Publisher</option><option value="admin">Administrator</option></select></label>}{action !== 'delete' && <label className="admin-field"><span>Administrator note {needsReason && <b>Required</b>}</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder={needsReason ? 'Explain this decision…' : 'Optional note…'} /></label>}{error && <div className="auth-error">{error}</div>}<div className="decision-actions"><button type="button" className="button button--secondary" onClick={close}>Cancel</button><button type="button" className={`button ${['decline', 'suspend', 'delete'].includes(action) ? 'button--danger' : 'button--primary'}`} onClick={confirm} disabled={busy || (needsReason && !note.trim())}>{busy && <LoaderCircle className="spin" size={16} />} Confirm</button></div></section></div>
}

export function AdminReviewsPage() {
  const { apps, setApps, loading, error, load } = useAdminData()
  const [selected, setSelected] = useState<{ app: StoreApp; type: 'listing' | 'release' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const queue = useMemo(() => [...apps.filter((app) => app.submissionStatus === 'pending').map((app) => ({ app, type: 'listing' as const })), ...apps.filter((app) => app.releaseSubmissionStatus === 'pending').map((app) => ({ app, type: 'release' as const }))], [apps])

  const decide = async (action: 'approve' | 'request_changes' | 'decline') => {
    if (!selected) return
    setBusy(true); setActionError('')
    try {
      const path = selected.type === 'listing' ? 'review' : 'release-review'
      const response = await fetch(`/api/admin/apps/${selected.app.id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      const updated = await response.json() as StoreApp
      setApps((current) => current.map((app) => app.id === updated.id ? updated : app))
      setSelected(null); setNote('')
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The decision could not be saved.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="admin-content"><AppCardSkeleton count={4} /></div>
  return (
    <div className="admin-content">
      <section className="admin-section-title"><div><p className="eyebrow">Publishing moderation</p><h2>Review queue</h2><p>Nothing reaches the public shelf until an administrator approves it.</p></div><span>{queue.length} waiting</span></section>
      {error && <AdminError message={error} retry={load} />}
      <div className="review-list">
        {queue.map((item) => <button type="button" className="review-row" key={`${item.type}-${item.app.id}`} onClick={() => { setSelected(item); setNote(''); setActionError('') }}><AppIcon app={item.app} size="medium" /><span className="review-type">{item.type === 'listing' ? <FileCheck2 size={14} /> : <Rocket size={14} />}{item.type === 'listing' ? 'App listing' : 'Version update'}</span><span className="review-main"><strong>{item.app.name}</strong><small>{item.type === 'release' ? `Version ${item.app.pendingRelease?.version}` : item.app.tagline}</small></span><span className="review-owner"><small>Submitted by</small><strong>{item.app.ownerName || 'Unknown publisher'}</strong></span><span className="review-date">{formatDate((item.type === 'release' ? item.app.releaseSubmittedAt : item.app.submittedAt)?.slice(0, 10) || item.app.updated)}</span><ArrowRight size={17} /></button>)}
        {!queue.length && <div className="queue-clear"><div><CheckCircle2 /></div><h3>Everything is reviewed.</h3><p>New app and update submissions will appear here.</p></div>}
      </div>
      <ReviewModerationPanel />
      {selected && <ReviewDrawer item={selected} note={note} setNote={setNote} busy={busy} error={actionError} close={() => setSelected(null)} decide={decide} />}
    </div>
  )
}

function ReviewDrawer({ item, note, setNote, busy, error, close, decide }: { item: { app: StoreApp; type: 'listing' | 'release' }; note: string; setNote: (value: string) => void; busy: boolean; error: string; close: () => void; decide: (action: 'approve' | 'request_changes' | 'decline') => void }) {
  const { app, type } = item
  const release = app.pendingRelease
  return <div className="review-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="review-drawer"><header><div><p className="eyebrow">{type === 'listing' ? 'Listing review' : 'Update review'}</p><h2>{app.name}</h2><span>Submitted by {app.ownerName}</span></div><button type="button" className="icon-button" onClick={close}><X /></button></header><div className="review-drawer__body"><div className="review-app-summary"><AppIcon app={app} size="large" /><div><strong>{type === 'release' ? `Version ${release?.version}` : app.tagline}</strong><p>{type === 'release' ? `${release?.size || app.size} · ${release?.date}` : app.description}</p></div></div>{type === 'listing' ? <><div className="review-facts"><span><small>Category</small><strong>{app.category}</strong></span><span><small>Platforms</small><strong>{app.platforms.join(', ')}</strong></span><span><small>Version</small><strong>{app.version}</strong></span></div><div className="review-gallery">{app.screenshots.slice(0, 4).map((image, index) => <img key={`${image}-${index}`} src={image} alt="" />)}</div></> : <div className="review-release"><h3>Release notes</h3><ul>{release?.notes.map((entry) => <li key={entry}>{entry}</li>)}</ul>{release?.downloadUrl && <a href={release.downloadUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Inspect submitted file</a>}</div>}<label className="admin-field"><span>Feedback to publisher</span><textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required when requesting changes or declining…" /></label>{error && <div className="auth-error">{error}</div>}</div><footer><button type="button" className="button button--danger" onClick={() => decide('decline')} disabled={busy || !note.trim()}><XCircle size={16} /> Decline</button><button type="button" className="button button--secondary" onClick={() => decide('request_changes')} disabled={busy || !note.trim()}><MessageSquareText size={16} /> Request changes</button><button type="button" className="button button--primary" onClick={() => decide('approve')} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Approve</button></footer></aside></div>
}

export function AdminAppsPage() {
  const { apps, setApps, loading, error, load } = useAdminData()
  const { deleteApp } = useStore()
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState('')
  const [removeTarget, setRemoveTarget] = useState<StoreApp | null>(null)
  const filtered = apps.filter((app) => [app.name, app.category, app.ownerName, app.submissionStatus].join(' ').toLowerCase().includes(query.toLowerCase()))

  const togglePublished = async (app: StoreApp) => {
    setBusyId(app.id)
    try {
      const action = app.submissionStatus === 'unpublished' ? 'republish' : 'unpublish'
      const response = await fetch(`/api/admin/apps/${app.id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: action === 'unpublish' ? 'Unpublished by administrator' : '' }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      const updated = await response.json() as StoreApp
      setApps((current) => current.map((item) => item.id === updated.id ? updated : item))
    } finally { setBusyId('') }
  }

  const remove = async () => {
    if (!removeTarget) return
    setBusyId(removeTarget.id)
    try { await deleteApp(removeTarget.id); setApps((current) => current.filter((item) => item.id !== removeTarget.id)); setRemoveTarget(null) }
    finally { setBusyId('') }
  }

  if (loading) return <div className="admin-content"><AppCardSkeleton count={6} /></div>
  return <div className="admin-content"><section className="admin-section-title"><div><p className="eyebrow">Entire catalog</p><h2>All listings</h2><p>Edit, update, unpublish, republish, or remove store listings.</p></div><Link to="/manage/new" className="button button--primary"><PlusIcon /> Add app</Link></section>{error && <AdminError message={error} retry={load} />}<div className="admin-toolbar"><div className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listings…" /></div></div><section className="listing-admin-grid">{filtered.map((app) => <article className="listing-admin-card" key={app.id}><div className="listing-admin-card__top"><AppIcon app={app} size="medium" /><div><strong>{app.name}</strong><small>{app.category} · {app.platforms.join(', ')}</small></div><StatusBadge status={app.submissionStatus ?? 'approved'} /></div><div className="listing-admin-card__meta"><span><small>Owner</small><strong>{app.ownerName || 'Starter catalog'}</strong></span><span><small>Version</small><strong>{app.version}</strong></span><span><small>Updated</small><strong>{formatDate(app.updated)}</strong></span></div><div className="listing-admin-card__actions"><Link to={`/manage/${app.id}/edit`}><Pencil size={15} /> Edit</Link><Link to={`/manage/${app.id}/updates`}><Rocket size={15} /> Updates</Link><button type="button" onClick={() => togglePublished(app)} disabled={busyId === app.id}>{app.submissionStatus === 'unpublished' ? <CheckCircle2 size={15} /> : <ShieldOff size={15} />}{app.submissionStatus === 'unpublished' ? 'Republish' : 'Unpublish'}</button>{app.source !== 'catalog' && <button type="button" className="is-danger" onClick={() => setRemoveTarget(app)}><Trash2 size={15} /></button>}</div></article>)}</section>{removeTarget && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setRemoveTarget(null)}><section className="confirm-dialog" role="dialog" aria-modal="true"><button type="button" className="icon-button confirm-dialog__close" onClick={() => setRemoveTarget(null)}><X size={18} /></button><div className="state-icon state-icon--error"><Trash2 /></div><h2>Remove {removeTarget.name}?</h2><p>This permanently removes the server listing and its uploaded files. This cannot be undone.</p><div className="confirm-dialog__actions"><button type="button" className="button button--secondary" onClick={() => setRemoveTarget(null)}>Cancel</button><button type="button" className="button button--danger" onClick={remove} disabled={busyId === removeTarget.id}>{busyId === removeTarget.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Remove permanently</button></div></section></div>}</div>
}

function PlusIcon() { return <Store size={16} /> }
function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-badge--${status}`}>{status.replace('_', ' ')}</span> }
function AdminError({ message, retry }: { message: string; retry: () => void }) { return <div className="admin-error"><AlertTriangle size={18} /><span>{message}</span><button type="button" onClick={retry}><RefreshCw size={15} /> Retry</button></div> }

export function AdminEditorialPage() {
  const { apps, loading: appsLoading } = useStore()
  const [collections, setCollections] = useState<EditorialCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState<EditorialCollection | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/editorial/collections')
      if (!response.ok) throw new Error(await getResponseError(response))
      setCollections(await response.json() as EditorialCollection[])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Editorial collections could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft) return
    setBusy(draft.id || 'new'); setError('')
    try {
      const response = await fetch(`/api/admin/editorial/collections${draft.id ? `/${encodeURIComponent(draft.id)}` : ''}`, { method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
      if (!response.ok) throw new Error(await getResponseError(response))
      const saved = await response.json() as EditorialCollection
      setCollections((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setDraft(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The collection could not be saved.') }
    finally { setBusy('') }
  }

  const remove = async (collection: EditorialCollection) => {
    if (!window.confirm(`Delete “${collection.title}”?`)) return
    setBusy(collection.id)
    try {
      const response = await fetch(`/api/admin/editorial/collections/${encodeURIComponent(collection.id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await getResponseError(response))
      setCollections((current) => current.filter((item) => item.id !== collection.id))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The collection could not be deleted.') }
    finally { setBusy('') }
  }

  if (loading || appsLoading) return <div className="admin-content"><AppCardSkeleton count={4} /></div>
  return <div className="admin-content editorial-admin"><section className="admin-section-title"><div><p className="eyebrow">Curated discovery</p><h2>Editorial collections</h2><p>Build deliberate public shelves without creating behavioral profiles.</p></div><button type="button" className="button button--primary" onClick={() => setDraft({ id: '', title: '', description: '', accent: 'violet', published: false, appIds: [], createdAt: '', updatedAt: '' })}><BookOpen size={16} /> New collection</button></section>{error && <AdminError message={error} retry={load} />}<section className="editorial-admin-grid">{collections.map((collection) => <article className={`editorial-admin-card accent-${collection.accent}`} key={collection.id}><header><span>{collection.published ? 'Published' : 'Draft'}</span><strong>{collection.title}</strong><p>{collection.description}</p></header><div className="editorial-admin-card__apps">{collection.appIds.map((id) => apps.find((app) => app.id === id)).filter(Boolean).slice(0, 5).map((app) => app && <AppIcon app={app} size="small" key={app.id} />)}<small>{collection.appIds.length} apps</small></div><footer><button type="button" onClick={() => setDraft(collection)}><Pencil size={15} /> Edit</button><button type="button" className="is-danger" onClick={() => void remove(collection)} disabled={busy === collection.id}><Trash2 size={15} /> Delete</button></footer></article>)}</section>{!collections.length && <EmptyState title="No editorial collections" body="Create the first hand-picked shelf for Discover." />}{draft && <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDraft(null)}><section className="editorial-dialog" role="dialog" aria-modal="true"><button type="button" className="auth-close" onClick={() => setDraft(null)}><X /></button><p className="eyebrow">Editorial desk</p><h2>{draft.id ? 'Edit collection' : 'New collection'}</h2><label className="admin-field"><span>Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="admin-field"><span>Description</span><textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label className="admin-field"><span>Accent</span><select value={draft.accent} onChange={(event) => setDraft({ ...draft, accent: event.target.value as EditorialCollection['accent'] })}>{['violet','plum','green','coral','blue','pink','amber','teal'].map((accent) => <option value={accent} key={accent}>{accent}</option>)}</select></label><fieldset className="editorial-app-picker"><legend>Included apps</legend>{apps.map((app) => <label key={app.id}><input type="checkbox" checked={draft.appIds.includes(app.id)} onChange={() => setDraft({ ...draft, appIds: draft.appIds.includes(app.id) ? draft.appIds.filter((id) => id !== app.id) : [...draft.appIds, app.id] })} /><AppIcon app={app} size="small" /><span>{app.name}</span></label>)}</fieldset><label className="editorial-publish-toggle"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Publish on Discover</label><footer><button type="button" className="button button--secondary" onClick={() => setDraft(null)}>Cancel</button><button type="button" className="button button--primary" onClick={() => void save()} disabled={Boolean(busy) || !draft.title.trim()}>{busy && <LoaderCircle className="spin" />} Save collection</button></footer></section></div>}</div>
}

interface SystemStatus {
  database: { path: string; sizeBytes: number; journalMode: string }
  backups: Array<{ name: string; sizeBytes: number; createdAt: string }>
  auditCount: number
  analyticsDays: number
  recentAudit: Array<{ actorName: string; action: string; targetType: string; targetId: string | null; summary: string; createdAt: string }>
}

export function AdminSystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/system')
      if (!response.ok) throw new Error(await getResponseError(response))
      setStatus(await response.json() as SystemStatus)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'System status could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const backup = async () => {
    setBusy('backup')
    try { const response = await fetch('/api/admin/system/backups', { method: 'POST' }); if (!response.ok) throw new Error(await getResponseError(response)); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup could not be created.') }
    finally { setBusy('') }
  }
  const restore = async (name: string) => {
    if (!window.confirm(`Restore ${name}? Current data will be backed up first and all sessions will be revoked.`)) return
    setBusy(name)
    try { const response = await fetch(`/api/admin/system/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }); if (!response.ok) throw new Error(await getResponseError(response)); window.location.assign('/') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The backup could not be restored.'); setBusy('') }
  }
  if (loading) return <div className="admin-content"><AppCardSkeleton count={3} /></div>
  return <div className="admin-content system-admin">
    <section className="admin-section-title"><div><p className="eyebrow">Persistence & recovery</p><h2>System operations</h2><p>Inspect SQLite health, audit sensitive changes, and create or restore consistent local backups.</p></div><button type="button" className="button button--primary" onClick={() => void backup()} disabled={Boolean(busy)}>{busy === 'backup' ? <LoaderCircle className="spin" /> : <Database />} Create backup</button></section>
    {error && <AdminError message={error} retry={load} />}
    {status && <>
      <section className="system-metrics"><article><Database /><span><strong>SQLite · {status.database.journalMode}</strong><small>{status.database.path} · {(status.database.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span></article><article><ShieldCheck /><span><strong>{status.auditCount} audit entries</strong><small>Security-sensitive operations are recorded.</small></span></article><article><Clock3 /><span><strong>{status.analyticsDays}-day retention</strong><small>Analytics expire automatically.</small></span></article></section>
      <section className="admin-table-card backup-list"><header><div><p className="eyebrow">Recovery points</p><h3>Database backups</h3></div></header>{status.backups.map((item) => <div className="backup-row" key={item.name}><Database /><span><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString()} · {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" className="mini-action" onClick={() => void restore(item.name)} disabled={Boolean(busy)}>{busy === item.name ? <LoaderCircle className="spin" /> : <RefreshCw />} Restore</button></div>)}{!status.backups.length && <EmptyState title="No backups yet" body="Create a recovery point before major changes." />}</section>
      <section className="admin-table-card audit-list"><header><div><p className="eyebrow">Accountability</p><h3>Recent audit activity</h3></div><span>{status.auditCount} total</span></header>{status.recentAudit.map((entry, index) => <div className="audit-row" key={`${entry.createdAt}-${entry.action}-${index}`}><ShieldCheck /><span><strong>{entry.summary}</strong><small>{entry.actorName} · {entry.action} · {entry.targetType}{entry.targetId ? ` ${entry.targetId}` : ''}</small></span><time>{new Date(entry.createdAt).toLocaleString()}</time></div>)}{!status.recentAudit.length && <EmptyState title="No audit activity yet" body="Sensitive account, publication, trust, and recovery operations appear here." />}</section>
    </>}
  </div>
}
