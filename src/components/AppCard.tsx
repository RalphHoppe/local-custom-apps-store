import { ArrowUpRight, Check, Download, Globe2, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StoreApp } from '../types'
import { useStore } from '../store/StoreContext'
import { AppIcon } from './AppIcon'

interface AppCardProps {
  app: StoreApp
  layout?: 'card' | 'row'
}

export function AppCard({ app, layout = 'card' }: AppCardProps) {
  const { favorites, installed, toggleFavorite, performPrimaryAction } = useStore()
  const isFavorite = favorites.includes(app.id)
  const isInstalled = installed.includes(app.id)

  return (
    <article className={`app-card app-card--${layout}`}>
      <Link to={`/app/${app.id}`} className="app-card__main" aria-label={`View ${app.name}`}>
        <AppIcon app={app} size={layout === 'row' ? 'small' : 'medium'} />
        <div className="app-card__copy">
          <div className="app-card__title-row">
            <h3>{app.name}</h3>
            {app.isNew && <span className="new-badge">New</span>}
          </div>
          <p>{app.tagline}</p>
          <div className="app-card__meta">
            <span>{app.category}</span>
            <span aria-hidden="true">·</span>
            <span>{app.platforms.length === 1 ? app.platforms[0] : `${app.platforms.length} platforms`}</span>
          </div>
        </div>
      </Link>
      <div className="app-card__actions">
        <button
          type="button"
          className={`icon-button icon-button--small favorite-button ${isFavorite ? 'is-active' : ''}`}
          onClick={() => toggleFavorite(app.id)}
          aria-label={isFavorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
        >
          <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="get-button" onClick={() => performPrimaryAction(app)}>
          {app.delivery === 'web' ? <Globe2 size={15} /> : isInstalled ? <Check size={15} /> : <Download size={15} />}
          <span>{app.delivery === 'web' ? 'Open' : isInstalled ? 'Get again' : 'Get'}</span>
          {app.delivery === 'web' && <ArrowUpRight size={13} className="external-mark" />}
        </button>
      </div>
    </article>
  )
}
