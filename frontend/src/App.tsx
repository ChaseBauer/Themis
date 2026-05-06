import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore, useThemeStore } from './store'
import Layout from './components/Layout'
import Login from './pages/Login'
import OAuthCallback from './pages/OAuthCallback'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import ChangeDetail from './pages/ChangeDetail'
import NewChange from './pages/NewChange'
import Changes from './pages/Changes'
import BatchChange from './pages/BatchChange'
import Admin from './pages/Admin'
import Drift from './pages/Drift'
import Profile from './pages/Profile'
import VendorProfileDocs from './pages/VendorProfileDocs'
import SitesTags from './pages/SitesTags'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RequireEditor({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'viewer') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { theme } = useThemeStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="sites-tags" element={<SitesTags />} />
          <Route path="devices/:deviceId/changes/new" element={<RequireEditor><NewChange /></RequireEditor>} />
          <Route path="changes" element={<Changes />} />
          <Route path="drift" element={<Drift />} />
          <Route path="changes/batch/new" element={<RequireEditor><BatchChange /></RequireEditor>} />
          <Route path="changes/:id" element={<ChangeDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="docs/vendor-profiles" element={<VendorProfileDocs />} />
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
