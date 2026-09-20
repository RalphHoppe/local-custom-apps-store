import { ArrowRight, Heart, Library, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppCard } from '../components/AppCard'
import { AppCardSkeleton, EmptyState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'

export function LibraryPage() {
  const { apps, installed, loading } = useStore()
  const libraryApps = apps.filter((app) => installed.includes(app.id))

  return (
    <CollectionShell
      eyebrow="Ready when you are"
      title="My library"
      description="Downloaded apps, all in one quiet place."
      icon={<Library />}
    >
      {loading ? <AppCardSkeleton count={4} /> : libraryApps.length ? (
        <div className="app-grid app-grid--catalog">{libraryApps.map((app) => <AppCard app={app} key={app.id} />)}</div>
      ) : (
        <EmptyState kind="library" action={<Link className="button button--primary" to="/apps">Explore apps <ArrowRight size={16} /></Link>} />
      )}
    </CollectionShell>
  )
}

export function FavoritesPage() {
  const { apps, favorites, loading } = useStore()
  const favoriteApps = apps.filter((app) => favorites.includes(app.id))

  return (
    <CollectionShell
      eyebrow="Your short list"
      title="Favorites"
      description="The things you want to come back to."
      icon={<Heart />}
    >
      {loading ? <AppCardSkeleton count={4} /> : favoriteApps.length ? (
        <div className="app-grid app-grid--catalog">{favoriteApps.map((app) => <AppCard app={app} key={app.id} />)}</div>
      ) : (
        <EmptyState kind="favorites" action={<Link className="button button--primary" to="/apps"><Plus size={16} /> Find something useful</Link>} />
      )}
    </CollectionShell>
  )
}

function CollectionShell({ eyebrow, title, description, icon, children }: { eyebrow: string; title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page collection-page">
      <section className="collection-header">
        <div className="collection-header__icon">{icon}</div>
        <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      </section>
      {children}
    </div>
  )
}
