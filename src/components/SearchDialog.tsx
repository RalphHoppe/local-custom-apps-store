import { ArrowRight, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { matchesApp } from '../utils'
import { AppIcon } from './AppIcon'

interface SearchDialogProps {
  open: boolean
  onClose: () => void
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
  const { apps } = useStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const results = useMemo(() => query.trim() ? apps.filter((app) => matchesApp(app, query)).slice(0, 6) : apps.slice(0, 5), [apps, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    window.setTimeout(() => inputRef.current?.focus(), 20)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose, open])

  if (!open) return null

  const openApp = (id: string) => {
    onClose()
    navigate(`/app/${id}`)
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search the store">
        <div className="search-dialog__input">
          <Search size={21} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search apps, tools, or categories"
            aria-label="Search apps"
          />
          <button type="button" className="icon-button icon-button--small" onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </div>
        <div className="search-dialog__body">
          <div className="search-dialog__label">{query ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Quick picks'}</div>
          {results.length > 0 ? results.map((app) => (
            <button type="button" className="search-result" key={app.id} onClick={() => openApp(app.id)}>
              <AppIcon app={app} size="small" />
              <span><strong>{app.name}</strong><small>{app.category} · {app.tagline}</small></span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          )) : (
            <div className="search-no-results">No app found for “{query}”</div>
          )}
        </div>
        <div className="search-dialog__footer"><kbd>Esc</kbd> to close <span /> Type to search everything</div>
      </section>
    </div>
  )
}
