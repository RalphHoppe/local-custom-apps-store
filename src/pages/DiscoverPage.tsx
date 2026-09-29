import { ArrowRight, ArrowUpRight, Download, Globe2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { AppCard } from '../components/AppCard'
import { AppCardSkeleton, ErrorState } from '../components/StoreStates'
import { AppIcon } from '../components/AppIcon'
import type { DiscoveryData, EditorialCollection, StoreApp } from '../types'

export function DiscoverPage() {
  const { apps, loading, error, reload, performPrimaryAction, privateDiscovery } = useStore()
  const [collections, setCollections] = useState<EditorialCollection[]>([])
  const [trendingIds, setTrendingIds] = useState<string[]>([])
  const [followedPublishers, setFollowedPublishers] = useState<string[]>([])
  useEffect(() => { fetch('/api/discovery').then((response) => response.ok ? response.json() as Promise<DiscoveryData> : Promise.reject()).then((data) => { setCollections(data.collections); setTrendingIds(data.trending.map((item) => item.appId)); setFollowedPublishers(data.followedPublishers) }).catch(() => undefined) }, [])
  const featured = apps.find((app) => app.featured) ?? apps[0]
  const newest = apps.filter((app) => app.isNew)
  const essentials = apps.filter((app) => !app.featured).slice(0, 4)
  const trending = trendingIds.map((id) => apps.find((app) => app.id === id)).filter(Boolean) as StoreApp[]
  const followedApps = apps.filter((app) => app.publisherUsername && followedPublishers.includes(app.publisherUsername))

  if (error) return <div className="page page--centered"><ErrorState retry={reload} /></div>

  return (
    <div className="page discover-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow"><Sparkles size={14} /> Thoughtful tools, one shelf</p>
          <h1>Find something<br />useful today.</h1>
          <p className="welcome-row__lead">Small, focused apps made to feel good from the first click.</p>
        </div>
        <div className="welcome-note">
          <span>{apps.length || '—'}</span>
          <p>independent apps<br />in the collection</p>
        </div>
      </section>

      {loading ? (
        <>
          <div className="featured-skeleton skeleton" />
          <section className="section-block"><div className="section-heading"><div><h2>Everyday essentials</h2></div></div><AppCardSkeleton /></section>
        </>
      ) : featured ? (
        <>
          <section className="featured-card accent-violet">
            <div className="featured-card__copy">
              <span className="feature-label">Featured this week</span>
              <AppIcon app={featured} size="large" />
              <div>
                <h2>{featured.name}</h2>
                <p>{featured.tagline}</p>
              </div>
              <div className="featured-card__actions">
                <button type="button" className="button button--ink" onClick={() => performPrimaryAction(featured)}>
                  {featured.delivery === 'web' ? <Globe2 size={17} /> : <Download size={17} />}
                  {featured.delivery === 'web' ? 'Open web app' : 'Download'}
                  {featured.delivery === 'web' && <ArrowUpRight size={15} />}
                </button>
                <Link to={`/app/${featured.id}`} className="text-link">See details <ArrowRight size={16} /></Link>
              </div>
            </div>
            <Link to={`/app/${featured.id}`} className="featured-card__art" aria-label={`See ${featured.name}`}>
              {featured.screenshots[0] ? <img src={featured.screenshots[0]} alt={`${featured.name} interface preview`} /> : <div className="feature-art-placeholder" />}
              <div className="featured-card__float"><span className="status-dot" /> Ready when you are</div>
            </Link>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div><span>Curated collection</span><h2>Everyday essentials</h2></div>
              <Link to="/apps">Browse all <ArrowRight size={16} /></Link>
            </div>
            <div className="app-grid">
              {essentials.map((app) => <AppCard key={app.id} app={app} />)}
            </div>
          </section>

          {trending.length > 0 && <section className="section-block"><div className="section-heading"><div><span>Store-wide momentum</span><h2>Trending now</h2></div></div><div className="horizontal-list">{trending.slice(0, 5).map((app) => <AppCard key={app.id} app={app} layout="row" />)}</div></section>}

          {followedApps.length > 0 && <section className="section-block"><div className="section-heading"><div><span>Publishers you follow</span><h2>From familiar makers</h2></div></div><div className="app-grid">{followedApps.slice(0, 4).map((app) => <AppCard key={app.id} app={app} />)}</div></section>}

          {privateDiscovery.length > 0 && <section className="section-block"><div className="section-heading"><div><span>Private to this browser</span><h2>Inspired by your recent activity</h2></div><small className="privacy-note">Computed locally · not sent as a profile</small></div><div className="app-grid">{privateDiscovery.slice(0, 4).map((app) => <AppCard key={app.id} app={app} />)}</div></section>}

          {collections.map((collection) => <EditorialShelf key={collection.id} collection={collection} apps={apps} />)}

          {newest.length > 0 && (
            <section className="section-block section-block--last">
              <div className="section-heading">
                <div><span>Fresh from the workbench</span><h2>New & noteworthy</h2></div>
              </div>
              <div className="horizontal-list">
                {newest.map((app) => <AppCard key={app.id} app={app} layout="row" />)}
              </div>
            </section>
          )}
        </>
      ) : null}

      <footer className="page-footer">
        <span>Local · Apps made with care</span>
        <Link to="/states">View interface states</Link>
      </footer>
    </div>
  )
}

function EditorialShelf({ collection, apps }: { collection: EditorialCollection; apps: StoreApp[] }) {
  const selected = collection.appIds.map((id) => apps.find((app) => app.id === id)).filter(Boolean) as StoreApp[]
  if (!selected.length) return null
  return <section className="section-block editorial-shelf"><div className="section-heading"><div><span>Local editorial</span><h2>{collection.title}</h2></div><Link to={`/collection/${collection.id}`}>Explore collection <ArrowRight size={16} /></Link></div><p className="editorial-shelf__description">{collection.description}</p><div className="app-grid">{selected.slice(0, 4).map((app) => <AppCard key={app.id} app={app} />)}</div></section>
}
