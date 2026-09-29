import { BadgeCheck, BellRing, BookOpen, Boxes, ExternalLink, Globe2, LifeBuoy, LoaderCircle, Mail, Pencil, UserCheck, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppCard } from '../components/AppCard'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'
import type { PublisherProfile } from '../types'

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function PublisherPage() {
  const { username = '' } = useParams()
  const { apps, loading: appsLoading, user, openAuth, notify, realtimeSignal } = useStore()
  const [profile, setProfile] = useState<PublisherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followBusy, setFollowBusy] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/publishers/${encodeURIComponent(username)}`)
      if (!response.ok) throw new Error(await getResponseError(response))
      setProfile(await response.json() as PublisherProfile)
    } catch (cause) {
      setProfile(null)
      setError(cause instanceof Error ? cause.message : 'This Publisher page could not be loaded.')
    } finally { if (!silent) setLoading(false) }
  }, [username])

  useEffect(() => { void load() }, [load, user?.id])
  useEffect(() => {
    if (['publisher.changed', 'publisher.follow.changed', 'subscriptions.changed'].includes(realtimeSignal.type) && (!realtimeSignal.username || realtimeSignal.username === username)) void load(true)
  }, [load, realtimeSignal.sequence, realtimeSignal.type, realtimeSignal.username, username])

  const publishedApps = useMemo(() => apps.filter((app) => app.publisherUsername === username), [apps, username])

  const toggleFollow = async () => {
    if (!profile) return
    if (!user) { openAuth('signin'); return }
    if (user.status !== 'approved' || !user.emailVerified) { notify('Your account must be approved and verified before following Publishers.', 'info'); return }
    setFollowBusy(true)
    try {
      const response = await fetch(`/api/publishers/${encodeURIComponent(profile.username)}/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ following: !profile.followedByViewer }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      const result = await response.json() as { following: boolean; followerCount: number }
      setProfile((current) => current ? { ...current, followedByViewer: result.following, followerCount: result.followerCount } : current)
      notify(result.following ? `Following ${profile.name}` : `Unfollowed ${profile.name}`, 'info')
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'The follow could not be updated.', 'error') }
    finally { setFollowBusy(false) }
  }

  if (loading || appsLoading) return <div className="page publisher-public-page"><div className="publisher-hero-skeleton" /><AppCardSkeleton count={4} /></div>
  if (!profile) return <div className="page page--centered"><EmptyState title="Publisher page unavailable" body={error || 'This Publisher may no longer be active.'} action={<Link to="/apps" className="button button--primary">Browse apps</Link>} /></div>

  const supportLinks = [
    profile.websiteUrl && { href: profile.websiteUrl, label: 'Website', icon: Globe2 },
    profile.supportUrl && { href: profile.supportUrl, label: 'Support', icon: LifeBuoy },
    profile.documentationUrl && { href: profile.documentationUrl, label: 'Documentation', icon: BookOpen },
    profile.supportEmail && { href: `mailto:${profile.supportEmail}`, label: 'Email support', icon: Mail },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Globe2 }[]

  return (
    <div className="page publisher-public-page">
      <section className={`publisher-public-hero publisher-accent--${profile.accent}`}>
        <div className="publisher-public-cover" style={profile.coverImage ? { backgroundImage: `linear-gradient(90deg, rgba(17,18,24,.22), rgba(17,18,24,.02)), url(${profile.coverImage})` } : undefined}><span>Publisher on Local</span></div>
        <div className="publisher-public-identity">
          <div className="publisher-public-logo">{profile.logoImage ? <img src={profile.logoImage} alt={`${profile.name} logo`} /> : <span>{initials(profile.name)}</span>}</div>
          <div className="publisher-public-title"><div><h1>{profile.name}</h1>{profile.verified && <span className="publisher-verified" title="Manually verified by a Local Administrator"><BadgeCheck /> Verified Publisher</span>}</div><p>{profile.headline}</p><small>@{profile.username} · Publishing on Local since {new Date(profile.joinedAt).getFullYear()}</small></div>
          <div className="publisher-public-actions">{profile.isOwn ? <Link to="/manage/publisher" className="button button--primary"><Pencil /> Edit Publisher page</Link> : <button type="button" className={`button ${profile.followedByViewer ? 'button--secondary is-following' : 'button--primary'}`} onClick={() => void toggleFollow()} disabled={followBusy}>{followBusy ? <LoaderCircle className="spin" /> : profile.followedByViewer ? <UserCheck /> : <UserPlus />}{profile.followedByViewer ? 'Following' : 'Follow Publisher'}</button>}</div>
        </div>
        <div className="publisher-public-stats"><span><strong>{profile.followerCount ?? 0}</strong><small><Users /> Followers</small></span><span><strong>{publishedApps.length}</strong><small><Boxes /> Published apps</small></span><span><strong>{profile.releaseSubscriberCount ?? 0}</strong><small><BellRing /> Release subscribers</small></span></div>
      </section>

      <div className="publisher-public-layout">
        <section className="publisher-about-card"><p className="eyebrow">About the Publisher</p><h2>{profile.about ? 'Made with intent and care.' : 'A home for thoughtfully made apps.'}</h2><p>{profile.about || `${profile.name} publishes independent apps for the Local community.`}</p>{supportLinks.length > 0 && <div className="publisher-support-links">{supportLinks.map(({ href, label, icon: Icon }) => <a key={label} href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel={href.startsWith('mailto:') ? undefined : 'noreferrer'}><Icon />{label}{!href.startsWith('mailto:') && <ExternalLink />}</a>)}</div>}</section>
        <aside className="publisher-trust-card"><span><BadgeCheck /></span><div><p>Publisher trust</p><h3>{profile.verified ? 'Identity reviewed by Local' : 'Independent Publisher'}</h3><small>{profile.verified ? 'An Administrator manually reviewed and verified this Publisher.' : 'Verification is manually administered and is not an automated endorsement.'}</small></div></aside>
      </div>

      <section className="publisher-apps-section"><header><div><p className="eyebrow">Published collection</p><h2>Apps by {profile.name}</h2></div><span>{publishedApps.length} {publishedApps.length === 1 ? 'app' : 'apps'}</span></header>{publishedApps.length ? <div className="app-grid">{publishedApps.map((app) => <AppCard app={app} key={app.id} />)}</div> : <EmptyState title="No published apps yet" body="Approved apps from this Publisher will appear here." />}</section>
    </div>
  )
}
