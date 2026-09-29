import { ArrowLeft, Layers3, LockKeyhole } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppCard } from '../components/AppCard'
import { AppIcon } from '../components/AppIcon'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { getResponseError, useStore } from '../store/StoreContext'
import type { DiscoveryData, EditorialCollection, StoreApp } from '../types'

export function EditorialCollectionPage() {
  const { collectionId = '' } = useParams()
  const { apps, loading: appsLoading, realtimeSignal } = useStore()
  const [collection, setCollection] = useState<EditorialCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/discovery')
      if (!response.ok) throw new Error(await getResponseError(response))
      const data = await response.json() as DiscoveryData
      const match = data.collections.find((item) => item.id === collectionId)
      if (!match) throw new Error('This editorial collection is not currently published.')
      setCollection(match)
    } catch (cause) { setCollection(null); setError(cause instanceof Error ? cause.message : 'The collection could not be loaded.') }
    finally { if (!silent) setLoading(false) }
  }, [collectionId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (realtimeSignal.type === 'discovery.changed' && (!realtimeSignal.collectionId || realtimeSignal.collectionId === collectionId)) void load(true) }, [collectionId, load, realtimeSignal.collectionId, realtimeSignal.sequence, realtimeSignal.type])

  const collectionApps = useMemo(() => (collection?.appIds ?? []).map((id) => apps.find((app) => app.id === id)).filter(Boolean) as StoreApp[], [apps, collection])

  if (loading || appsLoading) return <div className="page editorial-page"><AppCardSkeleton count={6} /></div>
  if (!collection) return <div className="page page--centered"><EmptyState title="Collection unavailable" body={error || 'This collection may have moved back to the editorial desk.'} action={<Link to="/" className="button button--primary">Back to Discover</Link>} /></div>

  return <div className="page editorial-page"><Link to="/" className="back-link"><ArrowLeft /> Back to Discover</Link><section className={`editorial-hero editorial-hero--${collection.accent}`}><div><p className="eyebrow"><Layers3 /> Local editorial</p><h1>{collection.title}</h1><p>{collection.description}</p><span><LockKeyhole /> Hand-picked by Administrators—not generated from personal history.</span></div><div className="editorial-hero__icons">{collectionApps.slice(0, 4).map((app, index) => <span style={{ '--position': index } as React.CSSProperties} key={app.id}><AppIcon app={app} size="large" /></span>)}</div></section><section className="editorial-app-list"><header><div><p className="eyebrow">Inside this collection</p><h2>{collectionApps.length} thoughtful {collectionApps.length === 1 ? 'pick' : 'picks'}</h2></div></header>{collectionApps.length ? <div className="app-grid app-grid--catalog">{collectionApps.map((app) => <AppCard app={app} key={app.id} />)}</div> : <EmptyState title="The shelf is empty" body="The selected apps are no longer publicly available." />}</section></div>
}
