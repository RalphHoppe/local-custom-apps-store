import {
  Boxes,
  Compass,
  Heart,
  Library,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { OfflineBanner } from './StoreStates'
import { SearchDialog } from './SearchDialog'
import { AuthDialog } from './AuthDialog'

const navItems = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/apps', label: 'All apps', icon: Boxes },
  { to: '/library', label: 'My library', icon: Library },
  { to: '/favorites', label: 'Favorites', icon: Heart },
]

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function Layout() {
  const { theme, toggleTheme, toasts, dismissToast, user, authLoading, guestActionsRemaining, openAuth, logout } = useStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const location = useLocation()
  const canPublish = user?.status === 'approved' && ['publisher', 'admin'].includes(user.role)
  const isAdmin = user?.status === 'approved' && user.role === 'admin'
  const managementRoute = location.pathname.startsWith('/manage') || location.pathname.startsWith('/admin')

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
    }
    const onlineHandler = () => setOnline(true)
    const offlineHandler = () => setOnline(false)
    document.addEventListener('keydown', keyHandler)
    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', offlineHandler)
    return () => {
      document.removeEventListener('keydown', keyHandler)
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [location.pathname])

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Local store home">
          <span className="brand__mark"><span /><span /><span /></span>
          <span><strong>Local</strong><small>Apps made with care</small></span>
        </NavLink>

        <nav className="sidebar__nav" aria-label="Main navigation">
          <p className="nav-label">Explore</p>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
              <Icon size={19} strokeWidth={1.9} />{label}
            </NavLink>
          ))}
          {canPublish && (
            <>
              <p className="nav-label nav-label--second">Manage</p>
              {isAdmin && <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}><ShieldCheck size={19} />Admin dashboard</NavLink>}
              <NavLink to="/manage" className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}><Settings2 size={19} />{isAdmin ? 'Store listings' : 'Publisher studio'}</NavLink>
            </>
          )}
        </nav>

        <div className="sidebar__bottom">
          {canPublish && <NavLink to="/manage/new" className="button button--primary button--full"><Plus size={17} /> Add an app</NavLink>}
          {!authLoading && !user && (
            <div className="guest-sidebar-actions">
              <button type="button" className="button button--primary button--full" onClick={() => openAuth('signin')}><LogIn size={17} /> Sign in</button>
              <button type="button" className="button button--ghost button--full" onClick={() => openAuth('signup')}><UserPlus size={17} /> Create account</button>
            </div>
          )}
          {user && (
            <div className="profile-mini">
              <NavLink to="/profile" className="profile-mini__main"><div className="profile-avatar">{initials(user.displayName)}</div><span><strong>{user.displayName}</strong><small>{user.status === 'approved' ? user.role : user.status}</small></span></NavLink>
              <button type="button" className="icon-button icon-button--small" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button>
            </div>
          )}
          <button type="button" className="sidebar-theme" onClick={toggleTheme}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />} {theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
        </div>
      </aside>

      <div className="workspace">
        {!online && <OfflineBanner />}
        <header className="topbar">
          <NavLink to="/" className="brand brand--mobile" aria-label="Local store home"><span className="brand__mark"><span /><span /><span /></span><strong>Local</strong></NavLink>
          <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={18} /><span>Search apps and tools</span><kbd>⌘ K</kbd></button>
          <div className="topbar__actions">
            <button type="button" className="icon-button theme-top-button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
            {!authLoading && !user && (
              <><span className="guest-allowance">{guestActionsRemaining} guest {guestActionsRemaining === 1 ? 'action' : 'actions'} left</span><button type="button" className="topbar-signup" onClick={() => openAuth('signup')}>Create account</button><button type="button" className="button button--primary" onClick={() => openAuth('signin')}><LogIn size={16} /> Sign in</button></>
            )}
            {canPublish && <NavLink to="/manage/new" className="button button--primary topbar-add"><Plus size={17} /> Add app</NavLink>}
            {user && !canPublish && <NavLink to="/profile" className={`topbar-account status-${user.status}`}><span>{initials(user.displayName)}</span><small>{user.status === 'approved' ? 'Member' : user.status}</small></NavLink>}
            {user && canPublish && <NavLink to="/profile" className="topbar-account topbar-account--publisher"><span>{initials(user.displayName)}</span><small>{isAdmin ? 'Admin' : 'Publisher'}</small></NavLink>}
            {user && <button type="button" className="icon-button topbar-logout" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button>}
          </div>
        </header>

        {user && user.status !== 'approved' && (
          <div className={`account-status-banner account-status-banner--${user.status}`}>
            <ShieldCheck size={17} />
            <span><strong>{user.status === 'pending' ? 'Account review in progress.' : `Account ${user.status}.`}</strong> {user.reviewNote || (user.status === 'pending' ? 'You can browse while an administrator reviews your request.' : 'Contact an administrator for more information.')}</span>
          </div>
        )}
        <main className="content"><Outlet /></main>
      </div>

      <nav className={`mobile-nav ${managementRoute ? 'mobile-nav--hidden' : ''}`} aria-label="Mobile navigation">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon size={20} /><span>{label === 'My library' ? 'Library' : label}</span></NavLink>)}
      </nav>

      <SearchDialog open={searchOpen} onClose={closeSearch} />
      <AuthDialog />
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => <div className={`toast toast--${toast.kind}`} key={toast.id}><span className="toast__dot" /><span>{toast.message}</span><button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss"><X size={15} /></button></div>)}
      </div>
    </div>
  )
}
