import { ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, MailCheck, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getResponseError, useStore } from '../store/StoreContext'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { refreshUser } = useStore()
  const [state, setState] = useState<'working' | 'success' | 'error'>('working')
  const [message, setMessage] = useState('Verifying your email address…')

  useEffect(() => {
    const token = params.get('token') ?? ''
    if (!token) { setState('error'); setMessage('This verification link is incomplete.'); return }
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        if (!response.ok) throw new Error(await getResponseError(response))
        setState('success'); setMessage('Your email is verified. Administrator approval is the only remaining step.'); await refreshUser().catch(() => undefined)
      })
      .catch((cause) => { setState('error'); setMessage(cause instanceof Error ? cause.message : 'Email verification failed.') })
  }, [params, refreshUser])

  return <AccountActionShell icon={state === 'working' ? <LoaderCircle className="spin" /> : state === 'success' ? <MailCheck /> : <ShieldAlert />} eyebrow="Email verification" title={state === 'working' ? 'One moment…' : state === 'success' ? 'Email verified.' : 'Verification failed.'} message={message} tone={state === 'error' ? 'error' : 'success'} action={<Link className="button button--primary button--large" to="/profile">Continue to your account <ArrowRight size={17} /></Link>} />
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('The passwords do not match.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.get('token') ?? '', password }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      setComplete(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The password could not be reset.') }
    finally { setBusy(false) }
  }

  if (complete) return <AccountActionShell icon={<Check />} eyebrow="Account recovery" title="Password updated." message="Your other sessions were signed out. Use your new password the next time you sign in." tone="success" action={<Link className="button button--primary button--large" to="/">Return to Local <ArrowRight size={17} /></Link>} />

  return (
    <div className="page account-action-page"><section className="account-action-card"><div className="account-action-card__icon"><KeyRound /></div><p className="eyebrow">Account recovery</p><h1>Choose a new password.</h1><p>Use at least eight characters. Saving it will sign out every existing session for this account.</p><form className="account-action-form" onSubmit={submit}>{error && <div className="auth-error">{error}</div>}<label><span>New password</span><div className="password-field"><KeyRound size={17} /><input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShow((current) => !current)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><label><span>Confirm password</span><input type={show ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label><button className="button button--primary button--large button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />} {busy ? 'Updating…' : 'Update password'}</button></form></section></div>
  )
}

function AccountActionShell({ icon, eyebrow, title, message, tone, action }: { icon: React.ReactNode; eyebrow: string; title: string; message: string; tone: 'success' | 'error'; action: React.ReactNode }) {
  return <div className="page account-action-page"><section className={`account-action-card account-action-card--${tone}`}><div className="account-action-card__icon">{icon}</div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{message}</p>{action}</section></div>
}
