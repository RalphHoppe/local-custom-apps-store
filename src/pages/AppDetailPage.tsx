import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe2,
  HardDrive,
  Heart,
  Laptop,
  Monitor,
  Pencil,
  Rocket,
  Share2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import { AppTrustSection } from '../components/AppTrustSection'
import { ReleaseChannelsSection } from '../components/ReleaseChannelsSection'
import { ReviewsSection } from '../components/ReviewsSection'
import { SimilarAppsSection } from '../components/SimilarAppsSection'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'
import type { Platform, StoreApp } from '../types'
import { formatDate } from '../utils'

const platformIcons: Record<Platform, React.ReactNode> = {
  Windows: <Monitor size={15} />,
  macOS: <Laptop size={15} />,
  Linux: <Laptop size={15} />,
  Android: <Smartphone size={15} />,
  iOS: <Smartphone size={15} />,
  Web: <Globe2 size={15} />,
}

export function AppDetailPage() {
  const { appId } = useParams()
  const { apps, loading, favorites, installed, user, toggleFavorite, performPrimaryAction, notify, trackEvent, recordRecentView } = useStore()
  const app = apps.find((item) => item.id === appId)

  useEffect(() => { if (app) { trackEvent('view', app.id, { surface: 'detail' }); recordRecentView(app) } }, [app?.id, recordRecentView, trackEvent])

  if (loading) return <div className="page"><AppCardSkeleton count={4} /></div>
  if (!app) return (
    <div className="page page--centered">
      <EmptyState title="This app isn’t on the shelf" body="It may have moved or been removed from the collection." action={<Link to="/apps" className="button button--primary">Browse all apps</Link>} />
    </div>
  )

  const isFavorite = favorites.includes(app.id)
  const isInstalled = installed.includes(app.id)
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: app.name, text: app.tagline, url: window.location.href })
      else {
        await navigator.clipboard.writeText(window.location.href)
        notify('Link copied to your clipboard')
      }
    } catch {
      // Sharing can be cancelled without needing an error message.
    }
  }

  return (
    <div className="page detail-page">
      <Link to="/apps" className="back-link"><ArrowLeft size={17} /> Back to apps</Link>

      <section className="detail-hero">
        <div className="detail-hero__top">
          <AppIcon app={app} size="hero" />
          <div className="detail-hero__identity">
            <div className="detail-labels"><span>{app.category}</span>{app.isNew && <span className="new-badge">New</span>}</div>
            <h1>{app.name}</h1>
            <p>{app.tagline}</p>
            {app.publisherUsername ? <Link className="publisher-inline-link" to={`/publisher/${app.publisherUsername}`}>by {app.developer}</Link> : <small>by {app.developer}</small>}
          </div>
          <div className="detail-hero__actions">
            <button type="button" className={`icon-button ${isFavorite ? 'is-active' : ''}`} onClick={() => toggleFavorite(app.id)} aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="button button--primary button--large" onClick={() => performPrimaryAction(app)}>
              {app.delivery === 'web' ? <Globe2 size={18} /> : isInstalled ? <Check size={18} /> : <Download size={18} />}
              {app.delivery === 'web' ? 'Open web app' : isInstalled ? 'Download again' : 'Download'}
              {app.delivery === 'web' && <ArrowUpRight size={16} />}
            </button>
          </div>
        </div>

        <div className="detail-facts">
          <div><span><Laptop size={16} /> Works on</span><strong>{app.platforms.join(' · ')}</strong></div>
          <div><span><HardDrive size={16} /> Size</span><strong>{app.size}</strong></div>
          <div><span><CalendarDays size={16} /> Updated</span><strong>{formatDate(app.updated)}</strong></div>
          <div><span><ShieldCheck size={16} /> Version</span><strong>{app.version}</strong></div>
        </div>
      </section>

      {app.screenshots.length > 0 && <ScreenshotGallery app={app} />}

      <AppTrustSection app={app} />
      <ReleaseChannelsSection app={app} />

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section">
            <p className="section-kicker">About this app</p>
            <h2>{app.description}</h2>
          </section>
          <section className="detail-section">
            <p className="section-kicker">Made for the everyday</p>
            <h2>A few useful things</h2>
            <div className="feature-list">
              {app.features.map((feature) => <div key={feature}><CheckCircle2 size={18} /><span>{feature}</span></div>)}
            </div>
          </section>
          <section className="detail-section">
            <p className="section-kicker">Available on</p>
            <div className="platform-list">
              {app.platforms.map((platform) => <span key={platform}>{platformIcons[platform]} {platform}</span>)}
            </div>
          </section>
        </div>

        <aside className="detail-aside">
          <div className="whats-new-card">
            <span className="version-pill">Version {app.version}</span>
            <h3>What’s new</h3>
            <ul>{app.whatsNew.map((item) => <li key={item}>{item}</li>)}</ul>
            <small>Updated {formatDate(app.updated)}</small>
          </div>
          <div className="detail-links">
            <button type="button" onClick={share}><Share2 size={17} /> Share this app</button>
            {user?.role === 'admin' && <><Link to={`/manage/${app.id}/updates`}><Rocket size={17} /> Manage updates</Link><Link to={`/manage/${app.id}/edit`}><Pencil size={17} /> Edit listing</Link></>}
            {(app.webUrl || app.downloadUrl) && <a href={app.webUrl ?? app.downloadUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Visit source</a>}
          </div>
        </aside>
      </div>
      <ReviewsSection app={app} />
      <SimilarAppsSection app={app} />
    </div>
  )
}

function ScreenshotGallery({ app }: { app: StoreApp }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const count = app.screenshots.length

  useEffect(() => setActiveIndex(0), [app.id])

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + count) % count)
  }

  return (
    <section className={`screenshot-gallery accent-${app.accent}`} aria-label={`${app.name} screenshots`}>
      <div className="screenshot-gallery__stage">
        <img src={app.screenshots[activeIndex]} alt={`${app.name} screenshot ${activeIndex + 1} of ${count}`} />
        {count > 1 && (
          <>
            <button type="button" className="gallery-arrow gallery-arrow--previous" onClick={() => move(-1)} aria-label="Previous screenshot"><ChevronLeft /></button>
            <button type="button" className="gallery-arrow gallery-arrow--next" onClick={() => move(1)} aria-label="Next screenshot"><ChevronRight /></button>
            <span className="gallery-count">{activeIndex + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="screenshot-gallery__thumbs">
          {app.screenshots.map((screenshot, index) => (
            <button type="button" className={index === activeIndex ? 'is-active' : ''} key={`${screenshot}-${index}`} onClick={() => setActiveIndex(index)} aria-label={`View screenshot ${index + 1}`}>
              <img src={screenshot} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
