import { BadgeCheck, BookOpen, ExternalLink, Globe2, Image, LifeBuoy, LoaderCircle, Mail, Save, ShieldCheck, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'
import type { Accent, PublisherProfile } from '../types'

const accents: Accent[] = ['violet', 'plum', 'green', 'coral', 'blue', 'pink', 'amber', 'teal']

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function PublisherProfilePage() {
  const { user, notify, refreshUser, realtimeSignal } = useStore()
  const [profile, setProfile] = useState<PublisherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/publisher/profile')
      if (!response.ok) throw new Error(await getResponseError(response))
      setProfile(await response.json() as PublisherProfile)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your Publisher profile could not be loaded.') }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (realtimeSignal.type === 'publisher.changed' && (!realtimeSignal.username || realtimeSignal.username === user?.username)) void load(true) }, [load, realtimeSignal.sequence, realtimeSignal.type, realtimeSignal.username, user?.username])

  const logoPreview = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : removeLogo ? '' : profile?.logoImage ?? '', [logoFile, profile?.logoImage, removeLogo])
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : removeCover ? '' : profile?.coverImage ?? '', [coverFile, profile?.coverImage, removeCover])
  useEffect(() => () => { if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview) }, [logoPreview])
  useEffect(() => () => { if (coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  const update = <K extends keyof PublisherProfile>(key: K, value: PublisherProfile[K]) => setProfile((current) => current ? { ...current, [key]: value } : current)
  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setLogoFile(file); setRemoveLogo(false) } }
  const chooseCover = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setCoverFile(file); setRemoveCover(false) } }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) return
    setSaving(true); setError('')
    try {
      const body = new FormData()
      body.set('profile', JSON.stringify({
        name: profile.name, headline: profile.headline, about: profile.about, accent: profile.accent,
        websiteUrl: profile.websiteUrl, supportUrl: profile.supportUrl, documentationUrl: profile.documentationUrl,
        supportEmail: profile.supportEmail, removeLogo, removeCover,
      }))
      if (logoFile) body.set('publisherLogo', logoFile)
      if (coverFile) body.set('publisherCover', coverFile)
      const response = await fetch('/api/publisher/profile', { method: 'PATCH', body })
      if (!response.ok) throw new Error(await getResponseError(response))
      setProfile(await response.json() as PublisherProfile)
      setLogoFile(null); setCoverFile(null); setRemoveLogo(false); setRemoveCover(false)
      await refreshUser()
      notify('Publisher page updated')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your Publisher page could not be saved.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="page publisher-editor-page"><AppCardSkeleton count={4} /></div>
  if (!profile || !user) return <div className="page page--centered"><EmptyState title="Publisher profile unavailable" body={error || 'A Publisher account is required.'} action={<Link to="/manage" className="button button--primary">Back to studio</Link>} /></div>

  return (
    <div className="page publisher-editor-page">
      <section className="page-title-row publisher-editor-title"><div><p className="eyebrow">Public Publisher identity</p><h1>Brand your page</h1><p>Keep your identity, support paths, and public story clear and useful.</p></div><Link to={`/publisher/${profile.username}`} className="button button--secondary button--large">View public page <ExternalLink /></Link></section>

      <div className="publisher-editor-layout">
        <form className="publisher-editor-form" onSubmit={save}>
          {error && <div className="auth-error">{error}</div>}
          <section className="publisher-editor-card"><header><span><Image /></span><div><h2>Visual identity</h2><p>A logo, cover, and restrained accent make the page recognizably yours.</p></div></header><div className="publisher-brand-upload-grid"><div className="publisher-logo-control"><div className={`publisher-logo-preview publisher-accent--${profile.accent}`}>{logoPreview ? <img src={logoPreview} alt="Publisher logo preview" /> : initials(profile.name)}</div><div><strong>Publisher logo</strong><small>Square PNG, JPG, or WebP · up to 5 MB</small><label className="button button--secondary"><UploadCloud /> Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label>{(logoPreview || profile.logoImage) && <button type="button" className="publisher-remove-media" onClick={() => { setLogoFile(null); setRemoveLogo(true) }}><Trash2 /> Remove</button>}</div></div><div className="publisher-cover-control" style={coverPreview ? { backgroundImage: `linear-gradient(90deg, rgba(19,19,27,.2), transparent), url(${coverPreview})` } : undefined}><span>{coverPreview ? 'Cover preview' : 'Add a wide cover image'}</span><label className="button button--secondary"><UploadCloud /> {coverPreview ? 'Replace cover' : 'Choose cover'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCover} /></label>{coverPreview && <button type="button" onClick={() => { setCoverFile(null); setRemoveCover(true) }}><Trash2 /> Remove</button>}</div></div><fieldset className="publisher-accent-picker"><legend>Brand accent</legend><div>{accents.map((accent) => <button type="button" key={accent} className={`publisher-accent-swatch publisher-accent--${accent} ${profile.accent === accent ? 'is-active' : ''}`} onClick={() => update('accent', accent)} aria-label={`${accent} accent`} aria-pressed={profile.accent === accent}><span /><small>{accent}</small></button>)}</div></fieldset></section>

          <section className="publisher-editor-card"><header><span><BadgeCheck /></span><div><h2>Publisher story</h2><p>Short, specific language helps people understand what you make.</p></div></header><div className="field-row field-row--two"><label className="field"><span className="field__label">Publisher name <small>{profile.name.length}/80</small></span><input maxLength={80} value={profile.name} onChange={(event) => update('name', event.target.value)} required /></label><label className="field"><span className="field__label">Headline <small>{profile.headline.length}/140</small></span><input maxLength={140} value={profile.headline} onChange={(event) => update('headline', event.target.value)} required /></label></div><label className="field"><span className="field__label">About <small>{profile.about.length}/1200</small></span><textarea rows={6} maxLength={1200} value={profile.about} onChange={(event) => update('about', event.target.value)} placeholder="What do you make, and who is it for?" /></label></section>

          <section className="publisher-editor-card"><header><span><LifeBuoy /></span><div><h2>Support & links</h2><p>Give customers clear destinations without crowding the page.</p></div></header><div className="publisher-link-fields"><label className="field"><span className="field__label"><Globe2 /> Website</span><input type="url" value={profile.websiteUrl} onChange={(event) => update('websiteUrl', event.target.value)} placeholder="https://studio.example" /></label><label className="field"><span className="field__label"><LifeBuoy /> Support center</span><input type="url" value={profile.supportUrl} onChange={(event) => update('supportUrl', event.target.value)} placeholder="https://studio.example/support" /></label><label className="field"><span className="field__label"><BookOpen /> Documentation</span><input type="url" value={profile.documentationUrl} onChange={(event) => update('documentationUrl', event.target.value)} placeholder="https://docs.studio.example" /></label><label className="field"><span className="field__label"><Mail /> Public support email</span><input type="email" value={profile.supportEmail} onChange={(event) => update('supportEmail', event.target.value)} placeholder="help@studio.example" /></label></div></section>

          <button type="submit" className="button button--primary button--large button--full" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} {saving ? 'Saving Publisher page…' : 'Save Publisher page'}</button>
        </form>

        <aside className="publisher-editor-aside"><section className={`publisher-editor-preview publisher-accent--${profile.accent}`}><div className="publisher-editor-preview__cover" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : undefined} /><div className="publisher-editor-preview__body"><div className="publisher-editor-preview__logo">{logoPreview ? <img src={logoPreview} alt="" /> : initials(profile.name)}</div><div><span>Live preview</span><h2>{profile.name || 'Publisher name'}</h2>{profile.verified && <strong><BadgeCheck /> Verified Publisher</strong>}<p>{profile.headline || 'Your short Publisher headline'}</p></div></div></section><section className={`publisher-verification-card ${profile.verified ? 'is-verified' : ''}`}><span><ShieldCheck /></span><div><p>Verification</p><h3>{profile.verified ? 'Manually verified' : 'Administrator controlled'}</h3><small>{profile.verified ? `Your identity was reviewed by Local${profile.verifiedAt ? ` on ${new Date(profile.verifiedAt).toLocaleDateString()}` : ''}.` : 'Only an Administrator can grant this badge. Profile edits never grant verification automatically.'}</small></div></section><section className="publisher-editor-tip"><strong>Keep support easy to find</strong><p>Links appear together on your public page, while app-specific links remain with each listing.</p></section></aside>
      </div>
    </div>
  )
}
