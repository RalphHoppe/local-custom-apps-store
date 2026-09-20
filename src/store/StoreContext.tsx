import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StoreApp, ToastKind, ToastMessage, UserAccount, UserRole } from '../types'
import { useLocalStorage } from '../hooks/useLocalStorage'

type Theme = 'light' | 'dark'
type AuthMode = 'signin' | 'signup'

export interface SaveAppPayload {
  app: StoreApp
  appFile?: File
  iconFile?: File
  screenshotFiles?: File[]
}

export interface PublishUpdatePayload {
  version: string
  date: string
  notes: string[]
  size?: string
  downloadUrl?: string
  releaseFile?: File
}

export interface SignUpPayload {
  username: string
  email: string
  displayName: string
  password: string
  requestedRole: Exclude<UserRole, 'admin'>
}

interface StoreContextValue {
  apps: StoreApp[]
  loading: boolean
  error: string | null
  reload: () => void
  favorites: string[]
  installed: string[]
  theme: Theme
  toasts: ToastMessage[]
  user: UserAccount | null
  authLoading: boolean
  authOpen: boolean
  authMode: AuthMode
  guestActionsRemaining: number
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  login: (identifier: string, password: string) => Promise<UserAccount>
  signup: (payload: SignUpPayload) => Promise<UserAccount>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  toggleFavorite: (id: string) => void
  performPrimaryAction: (app: StoreApp) => void
  saveApp: (payload: SaveAppPayload) => Promise<StoreApp>
  submitApp: (appId: string) => Promise<StoreApp>
  loadManagedApps: () => Promise<StoreApp[]>
  getManagedApp: (appId: string) => Promise<StoreApp>
  publishUpdate: (appId: string, payload: PublishUpdatePayload) => Promise<StoreApp>
  deleteRelease: (appId: string, releaseId: string) => Promise<void>
  deleteApp: (id: string) => Promise<void>
  toggleTheme: () => void
  notify: (message: string, kind?: ToastKind) => void
  dismissToast: (id: number) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

function readCachedCatalog(): StoreApp[] {
  try {
    const cached = window.localStorage.getItem('local-store-catalog-cache')
    return cached ? (JSON.parse(cached) as StoreApp[]) : []
  } catch {
    return []
  }
}

export async function getResponseError(response: Response) {
  try {
    const body = await response.json() as { error?: string }
    return body.error || `The store responded with ${response.status}.`
  } catch {
    return `The store responded with ${response.status}.`
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<StoreApp[]>(readCachedCatalog)
  const [favorites, setFavorites] = useLocalStorage<string[]>('local-store-favorites', ['quiet-notes'])
  const [installed, setInstalled] = useLocalStorage<string[]>('local-store-installed', ['quiet-notes'])
  const [theme, setTheme] = useLocalStorage<Theme>('local-store-theme', 'light')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [user, setUser] = useState<UserAccount | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [guestActionsUsed, setGuestActionsUsed] = useLocalStorage<number>('local-store-guest-actions', 0)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error(await getResponseError(response))
        return response.json() as Promise<{ user: UserAccount | null }>
      })
      .then((body) => { if (active) setUser(body.user) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(async () => {
      try {
        let response = await fetch('/api/apps')
        if (!response.ok) response = await fetch('/apps.json')
        if (!response.ok) throw new Error(`The catalog responded with ${response.status}`)
        const data = await response.json() as StoreApp[]
        if (active) {
          setApps(data)
          window.localStorage.setItem('local-store-catalog-cache', JSON.stringify(data))
        }
      } catch (cause) {
        if (active && readCachedCatalog().length === 0) setError(cause instanceof Error ? cause.message : 'The catalog could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }, 420)
    return () => { active = false; window.clearTimeout(timer) }
  }, [reloadKey])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111214' : '#f7f7f4')
  }, [theme])

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, message, kind }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200)
  }, [])

  const openAuth = useCallback((mode: AuthMode = 'signin') => { setAuthMode(mode); setAuthOpen(true) }, [])
  const closeAuth = useCallback(() => setAuthOpen(false), [])

  const refreshUser = useCallback(async () => {
    const response = await fetch('/api/auth/me')
    if (!response.ok) throw new Error(await getResponseError(response))
    const body = await response.json() as { user: UserAccount | null }
    setUser(body.user)
  }, [])

  useEffect(() => {
    if (!user) return
    const refresh = () => { void refreshUser().catch(() => undefined) }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshUser, user?.id])

  const login = useCallback(async (identifier: string, password: string) => {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) })
    if (!response.ok) throw new Error(await getResponseError(response))
    const body = await response.json() as { user: UserAccount }
    setUser(body.user)
    setAuthOpen(false)
    notify(`Welcome back, ${body.user.displayName}`)
    return body.user
  }, [notify])

  const signup = useCallback(async (payload: SignUpPayload) => {
    const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(await getResponseError(response))
    const body = await response.json() as { user: UserAccount }
    notify('Account created and sent for review')
    return body.user
  }, [notify])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    notify('Signed out', 'info')
  }, [notify])

  const requireApprovedAccount = useCallback(() => {
    if (!user) { openAuth('signin'); return false }
    if (user.status !== 'approved') {
      notify(user.status === 'pending' ? 'Your account is still waiting for approval.' : `Your account is ${user.status}.`, 'info')
      return false
    }
    return true
  }, [notify, openAuth, user])

  const toggleFavorite = useCallback((id: string) => {
    if (!requireApprovedAccount()) return
    setFavorites((current) => {
      const isFavorite = current.includes(id)
      notify(isFavorite ? 'Removed from favorites' : 'Saved to favorites', isFavorite ? 'info' : 'success')
      return isFavorite ? current.filter((item) => item !== id) : [...current, id]
    })
  }, [notify, requireApprovedAccount, setFavorites])

  const performAction = useCallback((app: StoreApp) => {
    const target = app.delivery === 'web' ? app.webUrl : app.downloadUrl
    if (!target) { notify(`No ${app.delivery === 'web' ? 'website' : 'download'} has been added yet.`, 'error'); return }
    if (app.delivery === 'web') {
      window.open(target, '_blank', 'noopener,noreferrer')
      notify(`Opening ${app.name}`, 'info')
      return
    }
    setInstalled((current) => (current.includes(app.id) ? current : [...current, app.id]))
    const anchor = document.createElement('a')
    anchor.href = target
    anchor.download = app.uploadedFileName ?? ''
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    notify(`${app.name} download started`)
  }, [notify, setInstalled])

  const performPrimaryAction = useCallback((app: StoreApp) => {
    if (user) {
      if (user.status !== 'approved') { notify('Your account must be approved before downloads and web apps are available.', 'info'); return }
      performAction(app)
      return
    }
    if (guestActionsUsed >= 3) {
      notify('Your three guest actions have been used. Sign in to continue.', 'info')
      openAuth('signin')
      return
    }
    const nextUsed = guestActionsUsed + 1
    setGuestActionsUsed(nextUsed)
    performAction(app)
    notify(nextUsed < 3 ? `${3 - nextUsed} guest action${3 - nextUsed === 1 ? '' : 's'} remaining` : 'This was your final guest action. Sign in for unlimited access.', 'info')
  }, [guestActionsUsed, notify, openAuth, performAction, setGuestActionsUsed, user])

  const saveApp = useCallback(async ({ app, appFile, iconFile, screenshotFiles = [] }: SaveAppPayload) => {
    const formData = new FormData()
    formData.append('listing', JSON.stringify(app))
    if (appFile) formData.append('appFile', appFile)
    if (iconFile) formData.append('icon', iconFile)
    screenshotFiles.forEach((file) => formData.append('screenshots', file))
    const response = await fetch('/api/apps', { method: 'POST', body: formData })
    if (!response.ok) throw new Error(await getResponseError(response))
    const saved = await response.json() as StoreApp
    if (user?.role === 'admin') setReloadKey((key) => key + 1)
    notify(user?.role === 'admin' ? `${saved.name} was published` : `${saved.name} was saved as a draft`)
    return saved
  }, [notify, user?.role])

  const submitApp = useCallback(async (appId: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/submit`, { method: 'POST' })
    if (!response.ok) throw new Error(await getResponseError(response))
    const saved = await response.json() as StoreApp
    notify(`${saved.name} was sent for administrator review`)
    return saved
  }, [notify])

  const loadManagedApps = useCallback(async () => {
    const response = await fetch('/api/manage/apps')
    if (!response.ok) throw new Error(await getResponseError(response))
    return response.json() as Promise<StoreApp[]>
  }, [])

  const getManagedApp = useCallback(async (appId: string) => {
    const response = await fetch(`/api/manage/apps/${encodeURIComponent(appId)}`)
    if (!response.ok) throw new Error(await getResponseError(response))
    return response.json() as Promise<StoreApp>
  }, [])

  const publishUpdate = useCallback(async (appId: string, payload: PublishUpdatePayload) => {
    const formData = new FormData()
    const { releaseFile, ...release } = payload
    formData.append('release', JSON.stringify(release))
    if (releaseFile) formData.append('releaseFile', releaseFile)
    const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/releases`, { method: 'POST', body: formData })
    if (!response.ok) throw new Error(await getResponseError(response))
    const saved = await response.json() as StoreApp
    if (user?.role === 'admin') setReloadKey((key) => key + 1)
    notify(user?.role === 'admin' ? `Version ${saved.version} is now live` : 'Update submitted for administrator review')
    return saved
  }, [notify, user?.role])

  const deleteRelease = useCallback(async (appId: string, releaseId: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(releaseId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await getResponseError(response))
    notify('Update removed', 'info')
  }, [notify])

  const deleteApp = useCallback(async (id: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await getResponseError(response))
    notify('Listing removed', 'info')
    setReloadKey((key) => key + 1)
  }, [notify])

  const value = useMemo<StoreContextValue>(() => ({
    apps, loading, error, reload: () => setReloadKey((key) => key + 1), favorites, installed,
    theme, toasts, user, authLoading, authOpen, authMode, guestActionsRemaining: Math.max(0, 3 - guestActionsUsed),
    openAuth, closeAuth, login, signup, logout, refreshUser,
    toggleFavorite, performPrimaryAction, saveApp, submitApp, loadManagedApps, getManagedApp,
    publishUpdate, deleteRelease, deleteApp,
    toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light'),
    notify, dismissToast: (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)),
  }), [apps, authLoading, authMode, authOpen, closeAuth, deleteApp, deleteRelease, error, favorites, getManagedApp, guestActionsUsed, installed, loadManagedApps, loading, login, logout, notify, openAuth, performPrimaryAction, publishUpdate, refreshUser, saveApp, setTheme, signup, submitApp, theme, toasts, toggleFavorite, user])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used within StoreProvider')
  return value
}
