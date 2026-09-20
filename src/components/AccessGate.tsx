import { Clock3, LockKeyhole, ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppCardSkeleton } from './StoreStates'
import { useStore } from '../store/StoreContext'
import type { UserRole } from '../types'

export function AccessGate({ children, roles, label = 'this area' }: { children: ReactNode; roles?: UserRole[]; label?: string }) {
  const { user, authLoading, openAuth } = useStore()

  if (authLoading) return <div className="page"><AppCardSkeleton count={3} /></div>
  if (!user) return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon"><LockKeyhole /></div><p className="eyebrow">Account required</p><h1>Sign in to use {label}.</h1><p>Browsing stays open to everyone. Personal and management tools belong to your account.</p><div><button type="button" className="button button--primary button--large" onClick={() => openAuth('signin')}>Sign in</button><button type="button" className="button button--secondary button--large" onClick={() => openAuth('signup')}>Create account</button></div></div>
    </div>
  )
  if (user.status !== 'approved') return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon"><Clock3 /></div><p className="eyebrow">{user.status} account</p><h1>{user.status === 'pending' ? 'Your request is being reviewed.' : 'Access is not available.'}</h1><p>{user.reviewNote || 'You can keep browsing the public catalog while an administrator reviews your account.'}</p></div>
    </div>
  )
  if (roles && !roles.includes(user.role)) return (
    <div className="page page--centered">
      <div className="access-state"><div className="state-icon state-icon--error"><ShieldX /></div><p className="eyebrow">Permission required</p><h1>You don’t have access to {label}.</h1><p>Your current role is {user.role}. An administrator controls role changes.</p></div>
    </div>
  )
  return children
}
