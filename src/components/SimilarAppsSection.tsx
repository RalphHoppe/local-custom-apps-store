import { ArrowRight, Blend } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import type { StoreApp } from '../types'
import { useStore } from '../store/StoreContext'
import { AppCard } from './AppCard'

export function SimilarAppsSection({ app }: { app: StoreApp }) {
  const { apps } = useStore()
  const similar = useMemo(() => apps.filter((candidate) => candidate.id !== app.id).map((candidate) => {
    const sharedPlatforms = candidate.platforms.filter((platform) => app.platforms.includes(platform)).length
    const score = (candidate.category === app.category ? 8 : 0) + sharedPlatforms * 2 + (candidate.publisherUsername && candidate.publisherUsername === app.publisherUsername ? 5 : 0) + (candidate.developer === app.developer ? 2 : 0) + (candidate.delivery === app.delivery ? 1 : 0)
    return { candidate, score }
  }).filter((item) => item.score > 1).sort((a, b) => b.score - a.score || b.candidate.updated.localeCompare(a.candidate.updated)).slice(0, 4).map((item) => item.candidate), [app, apps])

  if (!similar.length) return null
  return <section className="similar-apps-section"><header><div><p className="section-kicker"><Blend /> Similar picks</p><h2>More like {app.name}</h2><p>Related by category, platform, and Publisher—not by a synced profile.</p></div><Link to={`/apps?category=${encodeURIComponent(app.category)}`}>Explore {app.category} <ArrowRight /></Link></header><div className="app-grid">{similar.map((candidate) => <AppCard app={candidate} key={candidate.id} />)}</div></section>
}
