import { Bell, BellRing, CheckCircle2, FlaskConical, Layers3, LoaderCircle, Rocket, ShieldCheck, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getResponseError, useStore } from '../store/StoreContext'
import type { AppRelease, ReleaseChannel, StoreApp } from '../types'

const channels: { id: ReleaseChannel; title: string; description: string; icon: typeof ShieldCheck }[] = [
  { id: 'stable', title: 'Stable', description: 'Recommended, fully reviewed builds.', icon: ShieldCheck },
  { id: 'beta', title: 'Beta', description: 'Early access with more testing behind it.', icon: FlaskConical },
  { id: 'preview', title: 'Preview', description: 'The first look at what is coming next.', icon: Sparkles },
]

export function ReleaseChannelsSection({ app }: { app: StoreApp }) {
  const { user, openAuth, notify, performPrimaryAction, realtimeSignal } = useStore()
  const [subscribed, setSubscribed] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadSubscription = useCallback(async () => {
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/subscription`)
      if (!response.ok) throw new Error(await getResponseError(response))
      const data = await response.json() as { subscribed: boolean; subscriberCount: number }
      setSubscribed(data.subscribed); setSubscriberCount(data.subscriberCount)
    } catch { /* Release browsing remains available when subscription state is offline. */ }
    finally { setLoading(false) }
  }, [app.id])

  useEffect(() => { void loadSubscription() }, [loadSubscription, user?.id])
  useEffect(() => {
    if (realtimeSignal.type === 'subscriptions.changed' && (!realtimeSignal.appId || realtimeSignal.appId === app.id)) void loadSubscription()
  }, [app.id, loadSubscription, realtimeSignal.appId, realtimeSignal.sequence, realtimeSignal.type])

  const releases = useMemo(() => (app.releases ?? []).map((release) => ({ ...release, channel: release.channel ?? 'stable' as ReleaseChannel, status: release.status ?? 'published' as const, rolloutPercentage: release.rolloutPercentage ?? 100 })), [app.releases])

  const toggleSubscription = async () => {
    if (!user) { openAuth('signin'); return }
    if (user.status !== 'approved' || !user.emailVerified) { notify('Your account must be approved and verified before subscribing.', 'info'); return }
    setBusy(true)
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribed: !subscribed }) })
      if (!response.ok) throw new Error(await getResponseError(response))
      const data = await response.json() as { subscribed: boolean; subscriberCount: number }
      setSubscribed(data.subscribed); setSubscriberCount(data.subscriberCount)
      notify(data.subscribed ? `Subscribed to ${app.name} releases` : `Unsubscribed from ${app.name}`, 'info')
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Subscription could not be updated.', 'error') }
    finally { setBusy(false) }
  }

  const openRelease = (release: AppRelease) => {
    performPrimaryAction({ ...app, version: release.version, size: release.size ?? app.size, whatsNew: release.notes, downloadUrl: app.delivery === 'download' ? release.downloadUrl : app.downloadUrl, uploadedFileName: release.uploadedFileName })
  }

  return (
    <section className="public-release-channels" id="release-channels" aria-labelledby="release-channels-title">
      <header><div><p className="section-kicker"><Layers3 /> Choose your pace</p><h2 id="release-channels-title">Release channels</h2><p>Stable for everyday use, or opt into earlier builds when they are available to your rollout group.</p></div><button type="button" className={`release-subscribe ${subscribed ? 'is-active' : ''}`} onClick={() => void toggleSubscription()} disabled={busy || loading}>{busy || loading ? <LoaderCircle className="spin" /> : subscribed ? <BellRing /> : <Bell />}<span><strong>{subscribed ? 'Subscribed' : 'Notify me'}</strong><small>{subscriberCount} subscriber{subscriberCount === 1 ? '' : 's'}</small></span></button></header>
      <div className="public-channel-grid">
        {channels.map(({ id, title, description, icon: Icon }) => {
          const channelReleases = releases.filter((release) => release.channel === id && ['rolling', 'published'].includes(release.status))
          const latest = channelReleases[0]
          const available = channelReleases.find((release) => release.status === 'published' || release.audienceEligible)
          const fallback = id === 'stable' ? { id: `current-${app.id}`, version: app.version, notes: app.whatsNew, size: app.size, channel: 'stable' as const, status: 'published' as const, rolloutPercentage: 100, audienceEligible: true, date: app.updated, trust: app.trust } as AppRelease : null
          const release = available ?? fallback
          const stagedOutsideAudience = latest?.status === 'rolling' && !latest.audienceEligible
          return <article className={`public-channel public-channel--${id}`} key={id}><div className="public-channel__icon"><Icon /></div><div className="public-channel__copy"><span>{title}{id === 'stable' && <CheckCircle2 />}</span><p>{description}</p></div>{release ? <div className="public-channel__release"><strong>Version {release.version}</strong><small>{release.status === 'rolling' ? `${release.rolloutPercentage}% staged rollout` : 'Available now'}</small>{release.trust?.scanStatus === 'passed' && <i className="release-trust-badge"><ShieldCheck /> Checks passed</i>}</div> : <div className="public-channel__release is-empty"><strong>No build yet</strong><small>Nothing available on this channel</small></div>}{stagedOutsideAudience && <p className="audience-note"><Rocket /> {latest.version} is rolling out to {latest.rolloutPercentage}%. Your browser stays on {release?.version ?? app.version} for now.</p>}{id !== 'stable' && release && <button type="button" className="button button--secondary" onClick={() => openRelease(release)}>{app.delivery === 'web' ? 'Open' : 'Download'} {title}</button>}{id === 'stable' && <span className="stable-note">Used by the main {app.delivery === 'web' ? 'Open' : 'Download'} button</span>}</article>
        })}
      </div>
    </section>
  )
}
