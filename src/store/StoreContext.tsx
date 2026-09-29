import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActivityNotification, AppPermissionId, NotificationPreferences, RecentView, RealtimeSignal, ReleaseChannel, SignatureMetadata, StoreApp, ToastKind, ToastMessage, UserAccount, UserRole } from '../types'
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
  channel: ReleaseChannel
  rolloutPercentage: number
  scheduledAt?: string
  scheduleTimezone?: string
  permissions: AppPermissionId[]
  signature?: SignatureMetadata
  providedChecksum?: string
  releaseFile?: File
}

export interface SignUpResult {
  user: UserAccount
  previewUrl?: string
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
  recentViews: RecentView[]
  followedCategories: string[]
  categoryInterests: Record<string, number>
  privateDiscovery: StoreApp[]
  theme: Theme
  toasts: ToastMessage[]
  user: UserAccount | null
  authLoading: boolean
  authOpen: boolean
  authMode: AuthMode
  guestActionsRemaining: number
  notifications: ActivityNotification[]
  notificationsLoading: boolean
  notificationError: string
  realtimeStatus: 'connecting' | 'live' | 'offline'
  realtimeSignal: RealtimeSignal
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  login: (identifier: string, password: string) => Promise<UserAccount>
  signup: (payload: SignUpPayload) => Promise<SignUpResult>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  loadNotifications: () => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  clearReadNotifications: () => Promise<void>
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) => Promise<void>
  playNotificationTone: () => void
  trackEvent: (eventType: string, appId?: string, metadata?: Record<string, unknown>) => void
  toggleFavorite: (id: string) => void
  recordRecentView: (app: StoreApp) => void
  toggleCategoryFollow: (category: string) => void
  clearPersonalization: () => void
  performPrimaryAction: (app: StoreApp) => void
  saveApp: (payload: SaveAppPayload) => Promise<StoreApp>
  submitApp: (appId: string) => Promise<StoreApp>
  loadManagedApps: () => Promise<StoreApp[]>
  getManagedApp: (appId: string) => Promise<StoreApp>
  publishUpdate: (appId: string, payload: PublishUpdatePayload) => Promise<StoreApp>
  deleteRelease: (appId: string, releaseId: string) => Promise<void>
  rollbackRelease: (appId: string, releaseId: string, reason: string) => Promise<StoreApp>
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
  const [recentViews, setRecentViews] = useLocalStorage<RecentView[]>('local-store-recent-views', [])
  const [followedCategories, setFollowedCategories] = useLocalStorage<string[]>('local-store-followed-categories', [])
  const [categoryInterests, setCategoryInterests] = useLocalStorage<Record<string, number>>('local-store-category-interests', {})
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
  const [notifications, setNotifications] = useState<ActivityNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [realtimeSignal, setRealtimeSignal] = useState<RealtimeSignal>({ sequence: 0, type: 'initial' })
  const recentToastsRef = useRef(new Map<string, number>())
  const recentAnalyticsRef = useRef(new Map<string, number>())
  const recentViewWritesRef = useRef(new Map<string, number>())
  const audioContextRef = useRef<AudioContext | null>(null)
  const userRef = useRef<UserAccount | null>(null)

  useEffect(() => { userRef.current = user }, [user])

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
    if (!apps.length) setLoading(true)
    setError(null)
    const loadCatalog = async () => {
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
    }
    void loadCatalog()
    return () => { active = false }
  }, [reloadKey])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111214' : '#f7f7f4')
  }, [theme])

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const now = Date.now()
    const key = `${kind}:${message}`
    const previous = recentToastsRef.current.get(key) ?? 0
    if (now - previous < 1_500) return
    recentToastsRef.current.set(key, now)
    for (const [toastKey, timestamp] of recentToastsRef.current) if (now - timestamp > 10_000) recentToastsRef.current.delete(toastKey)
    const id = now + Math.floor(Math.random() * 1000)
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

  const loadNotifications = useCallback(async () => {
    if (!userRef.current) { setNotifications([]); return }
    setNotificationsLoading(true); setNotificationError('')
    try {
      const response = await fetch('/api/notifications')
      if (!response.ok) throw new Error(await getResponseError(response))
      setNotifications(await response.json() as ActivityNotification[])
    } catch (cause) {
      setNotificationError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')
    } finally { setNotificationsLoading(false) }
  }, [])

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item))
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: true }) })
    if (!response.ok) { await loadNotifications(); throw new Error(await getResponseError(response)) }
  }, [loadNotifications])

  const markAllNotificationsRead = useCallback(async () => {
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }))
    const response = await fetch('/api/notifications/read-all', { method: 'POST' })
    if (!response.ok) { await loadNotifications(); throw new Error(await getResponseError(response)) }
  }, [loadNotifications])

  const clearReadNotifications = useCallback(async () => {
    setNotifications((current) => current.filter((item) => !item.readAt))
    const response = await fetch('/api/notifications/read', { method: 'DELETE' })
    if (!response.ok) { await loadNotifications(); throw new Error(await getResponseError(response)) }
  }, [loadNotifications])

  const updateNotificationPreferences = useCallback(async (preferences: Partial<NotificationPreferences>) => {
    const response = await fetch('/api/auth/notification-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) })
    if (!response.ok) throw new Error(await getResponseError(response))
    const body = await response.json() as { user: UserAccount }
    setUser(body.user)
  }, [])

  const playNotificationTone = useCallback(() => {
    const preferences = userRef.current?.notificationPreferences
    if (!preferences?.soundEnabled) return
    try {
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      void context.resume().then(() => {
        const now = context.currentTime
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(880, now)
        oscillator.frequency.setValueAtTime(1174.66, now + 0.16)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(Math.max(0.015, preferences.soundVolume * 0.18), now + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(now)
        oscillator.stop(now + 0.43)
      }).catch(() => undefined)
    } catch { /* Audio is optional when a browser blocks playback. */ }
  }, [])

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext()
      void audioContextRef.current.resume().catch(() => undefined)
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    return () => { window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio) }
  }, [])

  useEffect(() => {
    if (user) void loadNotifications()
    else { setNotifications([]); setNotificationError('') }
  }, [loadNotifications, user?.id])

  useEffect(() => {
    setRealtimeStatus('connecting')
    const source = new EventSource('/api/events')
    source.onopen = () => setRealtimeStatus('live')
    source.onerror = () => setRealtimeStatus(navigator.onLine ? 'connecting' : 'offline')
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type: string; data?: { appId?: string; userId?: string; username?: string; collectionId?: string; notification?: ActivityNotification } }
        if (event.type === 'connected') { setRealtimeStatus('live'); return }
        if (['catalog.changed', 'security.changed'].includes(event.type)) setReloadKey((key) => key + 1)
        if (['managed.changed', 'admin.users.changed', 'account.changed', 'analytics.changed', 'reviews.changed', 'review_reports.changed', 'review_eligibility.changed', 'subscriptions.changed', 'publisher.changed', 'publisher.follow.changed', 'discovery.changed', 'security.changed'].includes(event.type)) {
          setRealtimeSignal((current) => ({ sequence: current.sequence + 1, type: event.type, appId: event.data?.appId, userId: event.data?.userId, username: event.data?.username, collectionId: event.data?.collectionId }))
        }
        if (event.type === 'account.changed') void refreshUser().catch(() => undefined)
        if (event.type === 'notifications.changed') void loadNotifications()
        const notification = event.data?.notification
        if (event.type === 'notification.created' && notification) {
          setNotifications((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current])
          const preferences = userRef.current?.notificationPreferences
          if (preferences?.liveToasts) notify(notification.title, notification.priority === 'important' ? 'success' : 'info')
          if (preferences?.soundEnabled && (preferences.soundScope === 'all' || notification.priority === 'important')) playNotificationTone()
          if (preferences?.browserNotifications && window.Notification?.permission === 'granted') {
            new window.Notification(notification.title, { body: notification.body, tag: notification.id })
          }
        }
      } catch { /* Ignore malformed live events and keep the connection open. */ }
    }
    return () => source.close()
  }, [loadNotifications, notify, playNotificationTone, refreshUser, user?.id, user?.role, user?.status])

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
    const body = await response.json() as { user: UserAccount; previewUrl?: string }
    notify('Account created — verify your email next')
    return body
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
    if (!user.emailVerified) { notify('Verify your email before using personal features.', 'info'); return false }
    return true
  }, [notify, openAuth, user])

  const trackEvent = useCallback((eventType: string, appId?: string, metadata: Record<string, unknown> = {}) => {
    if (navigator.doNotTrack === '1') return
    const now = Date.now()
    const key = `${eventType}:${appId ?? ''}:${JSON.stringify(metadata)}`
    if (now - (recentAnalyticsRef.current.get(key) ?? 0) < 1_200) return
    recentAnalyticsRef.current.set(key, now)
    for (const [eventKey, timestamp] of recentAnalyticsRef.current) if (now - timestamp > 10_000) recentAnalyticsRef.current.delete(eventKey)
    void fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType, appId, platform: navigator.platform || 'Web', metadata }), keepalive: true }).catch(() => undefined)
  }, [])

  const recordRecentView = useCallback((app: StoreApp) => {
    const now = Date.now()
    if (now - (recentViewWritesRef.current.get(app.id) ?? 0) < 1_500) return
    recentViewWritesRef.current.set(app.id, now)
    const cutoff = now - 30 * 86_400_000
    setRecentViews((current) => [{ appId: app.id, viewedAt: new Date(now).toISOString() }, ...current.filter((item) => item.appId !== app.id && new Date(item.viewedAt).getTime() >= cutoff)].slice(0, 16))
    setCategoryInterests((current) => ({ ...current, [app.category]: Math.min(50, (current[app.category] ?? 0) + 1) }))
  }, [setCategoryInterests, setRecentViews])

  const toggleCategoryFollow = useCallback((category: string) => {
    const following = followedCategories.includes(category)
    setFollowedCategories(following ? followedCategories.filter((item) => item !== category) : [...followedCategories, category])
    notify(following ? `Unfollowed ${category}` : `Following ${category} on this browser`, 'info')
  }, [followedCategories, notify, setFollowedCategories])

  const clearPersonalization = useCallback(() => {
    setRecentViews([])
    setFollowedCategories([])
    setCategoryInterests({})
    notify('Private discovery history cleared', 'info')
  }, [notify, setCategoryInterests, setFollowedCategories, setRecentViews])

  const toggleFavorite = useCallback((id: string) => {
    if (!requireApprovedAccount()) return
    const isFavorite = favorites.includes(id)
    setFavorites(isFavorite ? favorites.filter((item) => item !== id) : [...favorites, id])
    notify(isFavorite ? 'Removed from favorites' : 'Saved to favorites', isFavorite ? 'info' : 'success')
    trackEvent('favorite', id, { action: isFavorite ? 'removed' : 'added' })
  }, [favorites, notify, requireApprovedAccount, setFavorites, trackEvent])

  const recordVerifiedUse = useCallback((app: StoreApp) => {
    if (!user || user.status !== 'approved' || !user.emailVerified) return
    void fetch(`/api/apps/${encodeURIComponent(app.id)}/use`, { method: 'POST', keepalive: true }).catch(() => undefined)
  }, [user])

  const performAction = useCallback((app: StoreApp, silent = false) => {
    if (app.trust?.integrityStatus === 'changed' || app.trust?.scanStatus === 'blocked') { notify(`${app.name} is paused because its build integrity needs review.`, 'error'); return false }
    const target = app.delivery === 'web' ? app.webUrl : app.downloadUrl
    if (!target) { notify(`No ${app.delivery === 'web' ? 'website' : 'download'} has been added yet.`, 'error'); return false }
    recordVerifiedUse(app)
    if (app.delivery === 'web') {
      window.open(target, '_blank', 'noopener,noreferrer')
      trackEvent('web_open', app.id, { version: app.version })
      if (!silent) notify(`Opening ${app.name}`, 'info')
      return true
    }
    setInstalled((current) => (current.includes(app.id) ? current : [...current, app.id]))
    const anchor = document.createElement('a')
    anchor.href = target
    anchor.download = app.uploadedFileName ?? ''
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    trackEvent('download', app.id, { version: app.version })
    if (!silent) notify(`${app.name} download started`)
    return true
  }, [notify, recordVerifiedUse, setInstalled, trackEvent])

  const performPrimaryAction = useCallback((app: StoreApp) => {
    if (user) {
      if (user.status !== 'approved') { notify('Your account must be approved before downloads and web apps are available.', 'info'); return }
      if (!user.emailVerified) { notify('Verify your email before downloads and web apps are available.', 'info'); return }
      performAction(app)
      return
    }
    if (guestActionsUsed >= 3) {
      notify('Your three guest actions have been used. Sign in to continue.', 'info')
      openAuth('signin')
      return
    }
    const nextUsed = guestActionsUsed + 1
    if (!performAction(app, true)) return
    setGuestActionsUsed(nextUsed)
    const action = app.delivery === 'web' ? `${app.name} opened` : `${app.name} download started`
    notify(nextUsed < 3 ? `${action} · ${3 - nextUsed} guest action${3 - nextUsed === 1 ? '' : 's'} remaining` : `${action} · final guest action used`, 'info')
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
    notify(user?.role === 'admin' ? (release.scheduledAt ? `Version ${release.version} was scheduled` : `${release.channel === 'stable' ? 'Stable' : release.channel === 'beta' ? 'Beta' : 'Preview'} ${release.version} started`) : 'Update submitted for administrator review')
    return saved
  }, [notify, user?.role])

  const deleteRelease = useCallback(async (appId: string, releaseId: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(releaseId)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await getResponseError(response))
    notify('Update removed', 'info')
  }, [notify])

  const rollbackRelease = useCallback(async (appId: string, releaseId: string, reason: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(releaseId)}/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    if (!response.ok) throw new Error(await getResponseError(response))
    const saved = await response.json() as StoreApp
    setReloadKey((key) => key + 1)
    notify(`${saved.name} was rolled back to ${saved.version}`, 'info')
    return saved
  }, [notify])

  const deleteApp = useCallback(async (id: string) => {
    const response = await fetch(`/api/apps/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await getResponseError(response))
    notify('Listing removed', 'info')
    setReloadKey((key) => key + 1)
  }, [notify])

  const privateDiscovery = useMemo(() => {
    const recentIds = new Set(recentViews.slice(0, 4).map((item) => item.appId))
    return apps.map((app) => ({ app, score: (categoryInterests[app.category] ?? 0) * 2 + (followedCategories.includes(app.category) ? 8 : 0) + (app.isNew ? 1 : 0) }))
      .filter((item) => item.score > 0 && !recentIds.has(item.app.id))
      .sort((a, b) => b.score - a.score || b.app.updated.localeCompare(a.app.updated))
      .map((item) => item.app).slice(0, 8)
  }, [apps, categoryInterests, followedCategories, recentViews])

  const value = useMemo<StoreContextValue>(() => ({
    apps, loading, error, reload: () => setReloadKey((key) => key + 1), favorites, installed,
    recentViews, followedCategories, categoryInterests, privateDiscovery,
    theme, toasts, user, authLoading, authOpen, authMode, guestActionsRemaining: Math.max(0, 3 - guestActionsUsed),
    notifications, notificationsLoading, notificationError, realtimeStatus, realtimeSignal,
    openAuth, closeAuth, login, signup, logout, refreshUser,
    loadNotifications, markNotificationRead, markAllNotificationsRead, clearReadNotifications, updateNotificationPreferences, playNotificationTone, trackEvent,
    toggleFavorite, recordRecentView, toggleCategoryFollow, clearPersonalization, performPrimaryAction, saveApp, submitApp, loadManagedApps, getManagedApp,
    publishUpdate, deleteRelease, rollbackRelease, deleteApp,
    toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light'),
    notify, dismissToast: (id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)),
  }), [apps, authLoading, authMode, authOpen, categoryInterests, clearPersonalization, clearReadNotifications, closeAuth, deleteApp, deleteRelease, error, favorites, followedCategories, getManagedApp, guestActionsUsed, installed, loadManagedApps, loadNotifications, loading, login, logout, markAllNotificationsRead, markNotificationRead, notificationError, notifications, notificationsLoading, notify, openAuth, performPrimaryAction, playNotificationTone, privateDiscovery, publishUpdate, realtimeSignal, realtimeStatus, recentViews, recordRecentView, refreshUser, rollbackRelease, saveApp, setTheme, signup, submitApp, theme, toasts, toggleCategoryFollow, toggleFavorite, trackEvent, updateNotificationPreferences, user])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used within StoreProvider')
  return value
}
