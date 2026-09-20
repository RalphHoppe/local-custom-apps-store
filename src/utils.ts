import type { StoreApp } from './types'

export const accentOptions: StoreApp['accent'][] = ['violet', 'plum', 'green', 'coral', 'blue', 'pink', 'amber', 'teal']

export function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function matchesApp(app: StoreApp, query: string) {
  const haystack = [app.name, app.tagline, app.description, app.category, app.developer, ...app.platforms]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}
