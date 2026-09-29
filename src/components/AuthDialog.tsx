import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, MailCheck, ShieldCheck, Store, UserRound, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store/StoreContext'
import type { UserRole } from '../types'

export function AuthDialog() {
  const { authOpen, authMode, closeAuth, openAuth, login, signup } = useStore()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [registered, setRegistered] = useState(false)
  const [verificationUrl, setVerificationUrl] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [resetPreviewUrl, setResetPreviewUrl] = useState('')

  useEffect(() => {
    if (!authOpen) return
    setError('')
    setRegistered(false)
    setVerificationUrl('')
    setForgotOpen(false)
    setForgotSent(false)
    setResetPreviewUrl('')
    document.body.classList.add('no-scroll')
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAuth() }
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', closeOnEscape) }
  }, [authOpen, authMode, closeAuth])

  if (!authOpen) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (authMode === 'signin') await login(identifier, password)
      else {
        const result = await signup({ username, email, displayName, password, requestedRole: role })
        setVerificationUrl(result.previewUrl ?? '')
        setRegistered(true)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
      const body = await response.json() as { error?: string; previewUrl?: string }
      if (!response.ok) throw new Error(body.error || 'The reset request could not be started.')
      setResetPreviewUrl(body.previewUrl ?? '')
      setForgotSent(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The reset request could not be started.') }
    finally { setBusy(false) }
  }

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAuth()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="auth-close" onClick={closeAuth} aria-label="Close"><X size={18} /></button>
        <div className="auth-visual">
          <div className="auth-visual__brand"><span className="brand__mark"><span /><span /><span /></span><strong>Local</strong></div>
          <div className="auth-visual__copy">
            <span className="auth-orbit"><Store size={27} /></span>
            <p>One account.<br />A more personal shelf.</p>
            <small>Save favorites, keep your library close, or share your own work with the community.</small>
          </div>
          <div className="auth-trust"><ShieldCheck size={16} /><span><strong>Reviewed accounts</strong><small>Every registration is checked by an administrator.</small></span></div>
        </div>

        <div className="auth-panel">
          {registered ? (
            <div className="auth-success">
              <div className="auth-success__icon"><Check /></div>
              <p className="eyebrow">Registration received</p>
              <h2 id="auth-title">Two checks, then you’re in.</h2>
              <p>Verify your email and wait for administrator approval. You can sign in now to follow both statuses while continuing to browse.</p>
              {verificationUrl && <a className="button button--primary button--large button--full" href={verificationUrl}><MailCheck size={17} /> Open local verification message</a>}
              <button type="button" className={`button ${verificationUrl ? 'button--secondary' : 'button--primary'} button--large button--full`} onClick={() => { setIdentifier(username); setPassword(''); openAuth('signin') }}>Continue to sign in <ArrowRight size={17} /></button>
            </div>
          ) : (
            <>
              {forgotOpen ? (
                <div className="auth-forgot">
                  <button type="button" className="auth-forgot__back" onClick={() => { setForgotOpen(false); setForgotSent(false); setError('') }}><ArrowLeft size={15} /> Back to sign in</button>
                  <div className="auth-heading"><p className="eyebrow">Account recovery</p><h2 id="auth-title">{forgotSent ? 'Check the reset message.' : 'Reset your password.'}</h2><p>{forgotSent ? 'If the account exists, a secure one-hour reset link is ready.' : 'Enter your username or email. We never reveal whether an account exists.'}</p></div>
                  {forgotSent ? <div className="auth-recovery-result"><div className="auth-success__icon"><MailCheck /></div>{resetPreviewUrl && <a className="button button--primary button--large button--full" href={resetPreviewUrl}><KeyRound size={17} /> Open local reset message</a>}<button type="button" className="button button--secondary button--large button--full" onClick={() => { setForgotOpen(false); setForgotSent(false) }}>Return to sign in</button></div> : <form className="auth-form" onSubmit={requestReset}>{error && <div className="auth-error">{error}</div>}<label><span>Username or email</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Username or email" autoComplete="username" required autoFocus /></label><button type="submit" className="button button--primary button--large button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />} {busy ? 'Please wait…' : 'Create reset link'}</button></form>}
                </div>
              ) : <>
              <div className="auth-tabs" role="tablist">
                <button type="button" className={authMode === 'signin' ? 'is-active' : ''} onClick={() => openAuth('signin')}>Sign in</button>
                <button type="button" className={authMode === 'signup' ? 'is-active' : ''} onClick={() => openAuth('signup')}>Create account</button>
              </div>
              <div className="auth-heading">
                <p className="eyebrow">{authMode === 'signin' ? 'Welcome back' : 'Join the store'}</p>
                <h2 id="auth-title">{authMode === 'signin' ? 'Sign in to Local.' : 'Request an account.'}</h2>
                <p>{authMode === 'signin' ? 'Pick up where you left off.' : 'Every new account is reviewed before permissions are enabled.'}</p>
              </div>

              <form className="auth-form" onSubmit={submit}>
                {error && <div className="auth-error" role="alert">{error}</div>}
                {authMode === 'signup' && (
                  <>
                    <div className="auth-field-row">
                      <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name" required /></label>
                      <label><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="yourname" autoComplete="username" required /></label>
                    </div>
                    <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
                    <fieldset className="role-choice">
                      <legend>Account type</legend>
                      <button type="button" className={role === 'member' ? 'is-active' : ''} onClick={() => setRole('member')}><UserRound size={19} /><span><strong>Member</strong><small>Favorites, library, and unlimited access</small></span>{role === 'member' && <Check size={16} />}</button>
                      <button type="button" className={role === 'publisher' ? 'is-active' : ''} onClick={() => setRole('publisher')}><Store size={19} /><span><strong>Publisher</strong><small>Member access plus app submissions</small></span>{role === 'publisher' && <Check size={16} />}</button>
                    </fieldset>
                  </>
                )}
                {authMode === 'signin' && <label><span>Username or email</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Username or email" autoComplete="username" required autoFocus /></label>}
                <label><span>Password</span><div className="password-field"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Your password'} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                <button type="submit" className="button button--primary button--large button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : authMode === 'signin' ? <ArrowRight size={18} /> : <UserRound size={18} />} {busy ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Send for review'}</button>
              </form>
              {authMode === 'signin' && <><button type="button" className="forgot-password-link" onClick={() => { setForgotOpen(true); setError('') }}>Forgot password?</button><div className="admin-hint"><ShieldCheck size={15} /><span>Temporary administrator: <code>admin</code> / <code>admin123</code></span></div></>}
            </>}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
