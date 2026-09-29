import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleUserRound,
  FileCheck2,
  LoaderCircle,
  Radio,
  Rocket,
  Settings2,
  ShieldAlert,
  Store,
  Trash2,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import type { ActivityNotification, NotificationPreferences } from '../types'

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 45) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function notificationIcon(kind: ActivityNotification['kind']) {
  if (kind === 'account_review') return <UserCheck />
  if (kind === 'listing_review') return <FileCheck2 />
  if (kind === 'update_review') return <Rocket />
  if (kind === 'account_status') return <CircleUserRound />
  if (kind === 'listing_decision' || kind === 'update_decision') return <ShieldAlert />
  if (kind === 'publication') return <Store />
  if (kind === 'publisher_verification') return <BadgeCheck />
  return <Bell />
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" className={`notification-toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}

export function NotificationCenter() {
  const {
    user,
    notifications,
    notificationsLoading,
    notificationError,
    realtimeStatus,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearReadNotifications,
    updateNotificationPreferences,
    playNotificationTone,
    notify,
  } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [volume, setVolume] = useState(user?.notificationPreferences.soundVolume ?? 0.72)
  const [savingSetting, setSavingSetting] = useState('')
  const preferences = user?.notificationPreferences
  const unread = notifications.filter((item) => !item.readAt)
  const importantUnread = unread.some((item) => item.priority === 'important')
  const visible = useMemo(() => unreadOnly ? notifications.filter((item) => !item.readAt) : notifications, [notifications, unreadOnly])

  useEffect(() => { setVolume(preferences?.soundVolume ?? 0.72) }, [preferences?.soundVolume])
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', close) }
  }, [open])

  if (!user || !preferences) return null

  const updatePreference = async (name: keyof NotificationPreferences, value: NotificationPreferences[keyof NotificationPreferences]) => {
    setSavingSetting(name)
    try { await updateNotificationPreferences({ [name]: value }) }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Notification settings could not be saved.', 'error') }
    finally { setSavingSetting('') }
  }

  const toggleBrowserNotifications = async (enabled: boolean) => {
    if (enabled) {
      if (!('Notification' in window)) { notify('This browser does not support desktop notifications.', 'error'); return }
      const permission = await window.Notification.requestPermission()
      if (permission !== 'granted') { notify('Desktop notifications were not allowed by the browser.', 'info'); return }
    }
    await updatePreference('browserNotifications', enabled)
  }

  const openNotification = async (notification: ActivityNotification) => {
    if (!notification.readAt) await markNotificationRead(notification.id).catch(() => undefined)
    setOpen(false)
    if (notification.href) navigate(notification.href)
  }

  const markAll = async () => {
    try { await markAllNotificationsRead() }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Notifications could not be updated.', 'error') }
  }

  const clearRead = async () => {
    try { await clearReadNotifications() }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Notifications could not be cleared.', 'error') }
  }

  return (
    <>
      <button type="button" className={`notification-bell ${importantUnread ? 'has-important' : ''}`} onClick={() => { setOpen(true); setSettingsOpen(false); void loadNotifications() }} aria-label={`${unread.length} unread notification${unread.length === 1 ? '' : 's'}`} aria-expanded={open}>
        <Bell size={19} />
        {unread.length > 0 && <span>{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>
      {open && createPortal(
        <div className="notification-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
          <aside className="notification-panel" role="dialog" aria-modal="true" aria-label={settingsOpen ? 'Notification settings' : 'Notifications'}>
            <header className="notification-panel__header">
              <div>
                {settingsOpen && <button type="button" className="notification-back" onClick={() => setSettingsOpen(false)} aria-label="Back to notifications"><ArrowLeft size={18} /></button>}
                <span><strong>{settingsOpen ? 'Notification settings' : 'Notifications'}</strong><small className={`live-status live-status--${realtimeStatus}`}><Radio size={10} />{realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'connecting' ? 'Reconnecting' : 'Offline'}</small></span>
              </div>
              <div>{!settingsOpen && <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Notification settings"><Settings2 size={18} /></button>}<button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={18} /></button></div>
            </header>

            {settingsOpen ? (
              <NotificationSettings
                preferences={preferences}
                volume={volume}
                setVolume={setVolume}
                savingSetting={savingSetting}
                updatePreference={updatePreference}
                toggleBrowserNotifications={toggleBrowserNotifications}
                playNotificationTone={playNotificationTone}
              />
            ) : (
              <>
                <div className="notification-toolbar">
                  <div><button type="button" className={!unreadOnly ? 'is-active' : ''} onClick={() => setUnreadOnly(false)}>All</button><button type="button" className={unreadOnly ? 'is-active' : ''} onClick={() => setUnreadOnly(true)}>Unread {unread.length > 0 && <span>{unread.length}</span>}</button></div>
                  {unread.length > 0 && <button type="button" className="mark-all-button" onClick={markAll}><CheckCheck size={15} /> Mark all read</button>}
                </div>
                <div className="notification-list">
                  {notificationsLoading && !notifications.length && <div className="notification-loading"><LoaderCircle className="spin" /><span>Loading activity…</span></div>}
                  {notificationError && <div className="notification-error"><ShieldAlert /><span><strong>Couldn’t load activity</strong>{notificationError}</span><button type="button" onClick={() => void loadNotifications()}>Try again</button></div>}
                  {!notificationsLoading && !notificationError && !visible.length && <div className="notification-empty"><span><Bell /></span><h3>{unreadOnly ? 'You’re all caught up' : 'No activity yet'}</h3><p>{unreadOnly ? 'There are no unread notifications.' : 'Review requests and account updates will appear here in real time.'}</p></div>}
                  {visible.map((notification) => (
                    <button type="button" className={`notification-item ${notification.readAt ? '' : 'is-unread'} ${notification.priority === 'important' ? 'is-important' : ''}`} key={notification.id} onClick={() => void openNotification(notification)}>
                      <span className="notification-item__icon">{notificationIcon(notification.kind)}</span>
                      <span className="notification-item__copy"><span><strong>{notification.title}</strong><time>{relativeTime(notification.createdAt)}</time></span><p>{notification.body}</p>{notification.priority === 'important' && <small>Important</small>}</span>
                      <ChevronRight className="notification-item__arrow" size={16} />
                    </button>
                  ))}
                </div>
                {notifications.some((item) => item.readAt) && <footer className="notification-panel__footer"><button type="button" onClick={clearRead}><Trash2 size={14} /> Clear read notifications</button></footer>}
              </>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}

function SettingRow({ icon, title, body, control }: { icon: ReactNode; title: string; body: string; control: ReactNode }) {
  return <div className="notification-setting-row"><span className="notification-setting-row__icon">{icon}</span><span><strong>{title}</strong><small>{body}</small></span>{control}</div>
}

function NotificationSettings({
  preferences,
  volume,
  setVolume,
  savingSetting,
  updatePreference,
  toggleBrowserNotifications,
  playNotificationTone,
}: {
  preferences: NotificationPreferences
  volume: number
  setVolume: (value: number) => void
  savingSetting: string
  updatePreference: (name: keyof NotificationPreferences, value: NotificationPreferences[keyof NotificationPreferences]) => Promise<void>
  toggleBrowserNotifications: (enabled: boolean) => Promise<void>
  playNotificationTone: () => void
}) {
  return (
    <div className="notification-settings">
      <div className="notification-settings__intro"><span><Settings2 /></span><div><h3>Keep the right things noticeable.</h3><p>Important review activity is prominent by default. You can make alerts quieter without turning off the live panel.</p></div></div>
      <section>
        <h4>In-app alerts</h4>
        <SettingRow icon={<Bell />} title="Live activity toasts" body="Show one concise toast for new live notifications." control={<Toggle label="Live activity toasts" checked={preferences.liveToasts} onChange={(value) => void updatePreference('liveToasts', value)} />} />
        <SettingRow icon={preferences.soundEnabled ? <Volume2 /> : <VolumeX />} title="Alert sound" body="Play a short two-note tone for attention-worthy activity." control={<Toggle label="Alert sound" checked={preferences.soundEnabled} onChange={(value) => void updatePreference('soundEnabled', value)} />} />
        <div className={`sound-controls ${preferences.soundEnabled ? '' : 'is-disabled'}`}>
          <div><span>Volume</span><strong>{Math.round(volume * 100)}%</strong></div>
          <input type="range" min="0.1" max="1" step="0.05" value={volume} disabled={!preferences.soundEnabled} onChange={(event) => setVolume(Number(event.target.value))} onPointerUp={() => void updatePreference('soundVolume', volume)} onKeyUp={() => void updatePreference('soundVolume', volume)} aria-label="Notification sound volume" />
          <button type="button" onClick={playNotificationTone} disabled={!preferences.soundEnabled}><Volume2 size={14} /> Test tone</button>
        </div>
        <SettingRow icon={<ShieldAlert />} title="Sound for" body="Important-only keeps routine activity quiet." control={<select value={preferences.soundScope} onChange={(event) => void updatePreference('soundScope', event.target.value as 'important' | 'all')} aria-label="Choose which notifications make a sound"><option value="important">Important only</option><option value="all">All activity</option></select>} />
      </section>
      <section>
        <h4>Outside this tab</h4>
        <SettingRow icon={<CircleUserRound />} title="Desktop notifications" body="Ask the browser to show alerts outside this tab." control={<Toggle label="Desktop notifications" checked={preferences.browserNotifications && window.Notification?.permission === 'granted'} onChange={(value) => void toggleBrowserNotifications(value)} />} />
      </section>
      <div className="notification-settings__note"><Radio size={14} /><span><strong>Real-time updates stay on.</strong> Catalog, account, and review screens refresh automatically without requiring a page reload.</span></div>
      {savingSetting && <div className="settings-saving"><LoaderCircle className="spin" size={13} /> Saving settings…</div>}
    </div>
  )
}
