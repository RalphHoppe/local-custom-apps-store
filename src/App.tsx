import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DiscoverPage } from './pages/DiscoverPage'
import { AppsPage } from './pages/AppsPage'
import { AppDetailPage } from './pages/AppDetailPage'
import { FavoritesPage, LibraryPage } from './pages/CollectionPage'
import { AppFormPage } from './pages/AppFormPage'
import { ManagePage } from './pages/ManagePage'
import { StatesPage } from './pages/StatesPage'
import { UpdateManagementPage } from './pages/UpdateManagementPage'
import { EmptyState } from './components/StoreStates'
import { AccessGate } from './components/AccessGate'
import { AdminAppsPage, AdminEditorialPage, AdminOverviewPage, AdminReviewsPage, AdminShell, AdminSystemPage, AdminUsersPage } from './pages/AdminPages'
import { ProfilePage } from './pages/ProfilePage'
import { ResetPasswordPage, VerifyEmailPage } from './pages/AccountActionPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { PublisherPage } from './pages/PublisherPage'
import { PublisherProfilePage } from './pages/PublisherProfilePage'
import { EditorialCollectionPage } from './pages/EditorialCollectionPage'
import { AdminSecurityPage } from './pages/SecurityAdminPage'
import { Link } from 'react-router-dom'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DiscoverPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="library" element={<AccessGate label="your library"><LibraryPage /></AccessGate>} />
        <Route path="favorites" element={<AccessGate label="favorites"><FavoritesPage /></AccessGate>} />
        <Route path="app/:appId" element={<AppDetailPage />} />
        <Route path="publisher/:username" element={<PublisherPage />} />
        <Route path="collection/:collectionId" element={<EditorialCollectionPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="profile" element={<AccessGate label="your profile"><ProfilePage /></AccessGate>} />
        <Route path="insights" element={<AccessGate roles={['publisher', 'admin']} label="analytics"><AnalyticsPage /></AccessGate>} />
        <Route path="manage" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><ManagePage /></AccessGate>} />
        <Route path="manage/publisher" element={<AccessGate roles={['publisher']} label="Publisher branding"><PublisherProfilePage /></AccessGate>} />
        <Route path="manage/new" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><AppFormPage /></AccessGate>} />
        <Route path="manage/:appId/edit" element={<AccessGate roles={['publisher', 'admin']} label="publishing tools"><AppFormPage /></AccessGate>} />
        <Route path="manage/:appId/updates" element={<AccessGate roles={['publisher', 'admin']} label="update management"><UpdateManagementPage /></AccessGate>} />
        <Route path="admin" element={<AccessGate roles={['admin']} label="administrator tools"><AdminShell /></AccessGate>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="apps" element={<AdminAppsPage />} />
          <Route path="editorial" element={<AdminEditorialPage />} />
          <Route path="security" element={<AdminSecurityPage />} />
          <Route path="system" element={<AdminSystemPage />} />
        </Route>
        <Route path="states" element={<StatesPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<div className="page page--centered"><EmptyState title="You wandered off the shelf" body="That page doesn’t exist, but the apps are still nearby." action={<Link to="/" className="button button--primary">Back home</Link>} /></div>} />
      </Route>
    </Routes>
  )
}
