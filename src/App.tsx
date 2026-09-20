import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StoreProvider } from './store/StoreContext'
import { DiscoverPage } from './pages/DiscoverPage'
import { AppsPage } from './pages/AppsPage'
import { FavoritesPage, LibraryPage } from './pages/CollectionPage'
import { AppDetailPage } from './pages/AppDetailPage'
import { ManagePage } from './pages/ManagePage'
import { AppFormPage } from './pages/AppFormPage'
import { StatesPage } from './pages/StatesPage'
import { UpdateManagementPage } from './pages/UpdateManagementPage'
import { EmptyState } from './components/StoreStates'
import { AccessGate } from './components/AccessGate'
import { AdminAppsPage, AdminOverviewPage, AdminReviewsPage, AdminShell, AdminUsersPage } from './pages/AdminPages'
import { ProfilePage } from './pages/ProfilePage'
import { Link } from 'react-router-dom'

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DiscoverPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="library" element={<AccessGate label="your library"><LibraryPage /></AccessGate>} />
          <Route path="favorites" element={<AccessGate label="favorites"><FavoritesPage /></AccessGate>} />
          <Route path="app/:appId" element={<AppDetailPage />} />
          <Route path="profile" element={<AccessGate label="your profile"><ProfilePage /></AccessGate>} />
          <Route path="manage" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><ManagePage /></AccessGate>} />
          <Route path="manage/new" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><AppFormPage /></AccessGate>} />
          <Route path="manage/:appId/edit" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><AppFormPage /></AccessGate>} />
          <Route path="manage/:appId/updates" element={<AccessGate roles={['publisher', 'admin']} label="update management"><UpdateManagementPage /></AccessGate>} />
          <Route path="admin" element={<AccessGate roles={['admin']} label="administration"><AdminShell /></AccessGate>}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="apps" element={<AdminAppsPage />} />
          </Route>
          <Route path="states" element={<StatesPage />} />
          <Route path="*" element={<div className="page page--centered"><EmptyState title="You wandered off the shelf" body="That page doesn’t exist, but the apps are still nearby." action={<Link to="/" className="button button--primary">Back home</Link>} /></div>} />
        </Route>
      </Routes>
    </StoreProvider>
  )
}
