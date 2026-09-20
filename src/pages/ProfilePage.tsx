import { Check, Clock3, LoaderCircle, Mail, Save, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useStore, getResponseError } from '../store/StoreContext'

export function ProfilePage() {
  const { user, refreshUser, notify } = useStore()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDisplayName(user?.displayName ?? ''), [user])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      await refreshUser(); notify('Profile updated')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your profile could not be updated.') }
    finally { setSaving(false) }
  }

  if (!user) return null
  return (
    <div className="page profile-page">
      <section className="profile-header"><div className="profile-header__avatar">{user.displayName.slice(0, 2).toUpperCase()}</div><div><p className="eyebrow">Your Local account</p><h1>{user.displayName}</h1><p>@{user.username}</p></div><span className={`status-badge status-badge--${user.status}`}>{user.status}</span></section>
      <div className="profile-layout">
        <form className="profile-card" onSubmit={submit}><div className="profile-card__heading"><UserRound /><div><h2>Profile details</h2><p>How your name appears around the store.</p></div></div>{error && <div className="auth-error">{error}</div>}<label className="admin-field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="admin-field"><span>Username</span><div className="readonly-field"><UserRound size={16} />@{user.username}</div></label><label className="admin-field"><span>Email address</span><div className="readonly-field"><Mail size={16} />{user.email}</div></label><button type="submit" className="button button--primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save profile</button></form>
        <aside className="profile-card"><div className="profile-card__heading"><ShieldCheck /><div><h2>Access & role</h2><p>Permissions are controlled by an administrator.</p></div></div><div className="account-fact"><span>Account status</span><strong>{user.status === 'approved' ? <Check size={16} /> : <Clock3 size={16} />}{user.status}</strong></div><div className="account-fact"><span>Current role</span><strong>{user.role}</strong></div><div className="account-fact"><span>Requested role</span><strong>{user.requestedRole}</strong></div>{user.reviewNote && <div className="profile-note"><strong>Administrator note</strong><p>{user.reviewNote}</p></div>}</aside>
      </div>
    </div>
  )
}
