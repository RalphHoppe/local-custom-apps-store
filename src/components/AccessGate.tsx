import { Clock3, LoaderCircle, LockKeyhole, MailWarning, ShieldX } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AppCardSkeleton } from './StoreStates'
import { useStore } from '../store/StoreContext'
import type { UserRole } from '../types'

export function AccessGate({ children, roles, label = 'this area' }: { children: ReactNode; roles?: UserRole[]; label?: string }) {
  const { user, authLoading, openAuth } = useStore()
  if (authLoading) return <div className="page"><AppCardSkeleton count={3} /></div>
  if (!user) return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon"><LockKeyhole /></div><p className="eyebrow">Account required</p><h1>Sign in to open {label}.</h1><p>Your personal and publishing tools stay tied to your approved Local account.</p><button type="button" className="button button--primary button--large" onClick={() => openAuth('signin')}>Sign in</button></div>
    </div>
  )
  if (user.status !== 'approved') return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon"><Clock3 /></div><p className="eyebrow">{user.status} account</p><h1>{user.status === 'pending' ? 'Your request is being reviewed.' : 'Access is not available.'}</h1><p>{user.reviewNote || (user.status === 'pending' ? `You can keep browsing while an administrator reviews your account${user.emailVerified ? '.' : ' and you verify your email.'}` : 'Contact an administrator for more information.')}</p></div>
    </div>
  )
  if (!user.emailVerified) return <EmailVerificationGate email={user.email} />
  if (roles && !roles.includes(user.role)) return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon state-icon--error"><ShieldX /></div><p className="eyebrow">Permission required</p><h1>You don’t have access to {label}.</h1><p>Your current role is {user.role}. An administrator controls role changes.</p></div>
    </div>
  )
  return children
}

function EmailVerificationGate({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const resend = async () => {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST' })
      const body = await response.json() as { error?: string; previewUrl?: string }
      if (!response.ok) throw new Error(body.error || 'A new verification message could not be created.')
      if (body.previewUrl) window.location.assign(body.previewUrl)
      else setMessage('A new verification email has been sent.')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'A new verification message could not be created.') }
    finally { setBusy(false) }
  }
  return <div className="page page--centered"><div className="access-state"><div className="state-icon"><MailWarning /></div><p className="eyebrow">Email verification required</p><h1>Verify {email}.</h1><p>Your administrator approval is complete, but personal and publishing tools remain locked until your email is verified.</p><button type="button" className="button button--primary button--large" onClick={resend} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <MailWarning size={17} />} Create a new verification link</button>{message && <p className="access-inline-message">{message}</p>}</div></div>
}
