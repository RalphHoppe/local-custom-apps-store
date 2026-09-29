import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppCard } from '../components/AppCard'
import { AppCardSkeleton, EmptyState, ErrorState } from '../components/StoreStates'
import { useStore } from '../store/StoreContext'
import type { Platform } from '../types'
import { matchesApp } from '../utils'

const filters: Array<{ label: string; value: 'All' | Platform }> = [
  { label: 'All apps', value: 'All' },
  { label: 'Windows', value: 'Windows' },
  { label: 'macOS', value: 'macOS' },
  { label: 'Mobile', value: 'Android' },
  { label: 'Web', value: 'Web' },
]

export function AppsPage() {
  const { apps, loading, error, reload, trackEvent } = useStore()
  const [platform, setPlatform] = useState<'All' | Platform>('All')
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')

  useEffect(() => {
    if (query.trim().length < 2) return
    const timeout = window.setTimeout(() => { void trackEvent('search', undefined, { queryLength: query.trim().length, platform, category }) }, 700)
    return () => window.clearTimeout(timeout)
  }, [category, platform, query, trackEvent])

  const categories = useMemo(() => ['All', ...Array.from(new Set(apps.map((app) => app.category))).sort()], [apps])
  const filtered = useMemo(() => {
    const matches = apps.filter((app) => {
      const platformMatch = platform === 'All' || (platform === 'Android' ? app.platforms.some((item) => item === 'Android' || item === 'iOS') : app.platforms.includes(platform))
      return platformMatch && (category === 'All' || app.category === category) && (!query || matchesApp(app, query))
    })
    return [...matches].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updated.localeCompare(a.updated))
  }, [apps, category, platform, query, sort])

  const reset = () => {
    setPlatform('All')
    setCategory('All')
    setQuery('')
  }

  return (
    <div className="page catalog-page">
      <section className="page-title-row">
        <div><p className="eyebrow">The full collection</p><h1>All apps</h1><p>Browse every tool on the shelf.</p></div>
        <div className="catalog-count">{loading ? '—' : apps.length}<span>apps</span></div>
      </section>

      <div className="catalog-toolbar">
        <div className="inline-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an app…" aria-label="Find an app" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
        </div>
        <div className="select-wrap">
          <SlidersHorizontal size={16} />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <ChevronDown size={15} />
        </div>
        <div className="select-wrap select-wrap--sort">
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort apps">
            <option value="newest">Recently updated</option>
            <option value="name">A to Z</option>
          </select>
          <ChevronDown size={15} />
        </div>
      </div>

      <div className="filter-chips" role="group" aria-label="Filter by platform">
        {filters.map((item) => (
          <button key={item.label} type="button" className={platform === item.value ? 'is-active' : ''} onClick={() => setPlatform(item.value)}>{item.label}</button>
        ))}
      </div>

      {error ? <ErrorState retry={reload} /> : loading ? <AppCardSkeleton count={8} /> : filtered.length ? (
        <>
          <div className="results-line"><span>{filtered.length} {filtered.length === 1 ? 'app' : 'apps'}</span><i /></div>
          <div className="app-grid app-grid--catalog">{filtered.map((app) => <AppCard app={app} key={app.id} />)}</div>
        </>
      ) : (
        <EmptyState kind="search" action={<button type="button" className="button button--secondary" onClick={reset}>Clear all filters</button>} />
      )}
    </div>
  )
}
