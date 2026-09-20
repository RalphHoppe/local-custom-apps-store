import { AlertTriangle, CloudOff, PackageOpen, RefreshCw, SearchX } from 'lucide-react'

export function AppCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="app-grid" aria-label="Loading apps" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="app-card skeleton-card" key={index}>
          <div className="skeleton skeleton-icon" />
          <div className="skeleton-content">
            <div className="skeleton skeleton-line skeleton-line--short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line skeleton-line--medium" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  kind?: 'search' | 'library' | 'favorites' | 'catalog'
  title?: string
  body?: string
  action?: React.ReactNode
}

export function EmptyState({ kind = 'catalog', title, body, action }: EmptyStateProps) {
  const content = {
    search: { icon: SearchX, title: 'No matches this time', body: 'Try a different word or clear a filter to see more apps.' },
    library: { icon: PackageOpen, title: 'Your library is ready', body: 'Apps you download will stay organized here.' },
    favorites: { icon: PackageOpen, title: 'Nothing saved yet', body: 'Tap the heart on any app to keep it close.' },
    catalog: { icon: PackageOpen, title: 'A clean slate', body: 'Add your first app to begin building this store.' },
  }[kind]
  const Icon = content.icon

  return (
    <div className="empty-state">
      <div className="state-icon"><Icon aria-hidden="true" /></div>
      <h2>{title ?? content.title}</h2>
      <p>{body ?? content.body}</p>
      {action}
    </div>
  )
}

export function ErrorState({ retry, compact = false }: { retry?: () => void; compact?: boolean }) {
  return (
    <div className={`empty-state error-state ${compact ? 'empty-state--compact' : ''}`} role="alert">
      <div className="state-icon state-icon--error"><AlertTriangle aria-hidden="true" /></div>
      <h2>We couldn’t load the shelves</h2>
      <p>The catalog may be taking a break. Check your connection and try once more.</p>
      {retry && <button type="button" className="button button--primary" onClick={retry}><RefreshCw size={17} /> Try again</button>}
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div className="offline-banner" role="status">
      <CloudOff size={17} aria-hidden="true" />
      You’re offline. Your saved library is still available.
    </div>
  )
}
