import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Server,
  GitBranch,
  AlertTriangle,
  BookOpen,
  LogOut,
  ChevronRight,
  Shield,
  UserCircle,
} from 'lucide-react'
import { useAuthStore } from '../store'
import { driftApi } from '../api'
import themisLogo from '../../assets/themis-logo.svg'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Server, label: 'Devices' },
  { to: '/changes', icon: GitBranch, label: 'All Changes' },
  { to: '/drift', icon: AlertTriangle, label: 'Config Drift' },
]

export default function Sidebar() {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { data: openDrift = [] } = useQuery({
    queryKey: ['drift'],
    queryFn: () => driftApi.listOpen().then((r) => r.data),
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <aside className="fixed top-0 left-0 h-full w-64 flex flex-col" style={{ backgroundColor: '#1a1f2e' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <img src={themisLogo} alt="Themis" className="w-8 h-8" />
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight">Themis</div>

        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
          Navigation
        </p>
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = isActive(to)
          const hasDrift = to === '/drift' && openDrift.length > 0
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                active
                  ? hasDrift
                    ? 'bg-amber-500/20 text-amber-100'
                    : 'bg-blue-600/20 text-white'
                  : hasDrift
                    ? 'bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  hasDrift
                    ? 'text-amber-400'
                    : active
                      ? 'text-blue-400'
                      : 'text-white/40 group-hover:text-white/60'
                }`}
              />
              <span>{label}</span>
              {hasDrift && (
                <span className="ml-auto rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                  {openDrift.length}
                </span>
              )}
              {active && !hasDrift && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400" />
              )}
            </Link>
          )
        })}

        <div className="pt-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
            Docs
          </p>
          <a
            href="/docs.html"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group text-white/60 hover:text-white hover:bg-white/5"
          >
            <BookOpen className="w-4 h-4 flex-shrink-0 text-white/40 group-hover:text-white/60" />
            <span>API Docs</span>
          </a>
          <Link
            to="/docs/vendor-profiles"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
              isActive('/docs/vendor-profiles')
                ? 'bg-blue-600/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen
              className={`w-4 h-4 flex-shrink-0 ${
                isActive('/docs/vendor-profiles') ? 'text-blue-400' : 'text-white/40 group-hover:text-white/60'
              }`}
            />
            <span>Vendor Profiles</span>
            {isActive('/docs/vendor-profiles') && (
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400" />
            )}
          </Link>
        </div>

        {user?.role === 'admin' && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
              Admin
            </p>
            <Link
              to="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                isActive('/admin')
                  ? 'bg-blue-600/20 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Shield
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive('/admin') ? 'text-blue-400' : 'text-white/40 group-hover:text-white/60'
                }`}
              />
              <span>Admin Panel</span>
              {isActive('/admin') && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400" />
              )}
            </Link>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 py-3 border-t border-white/10">

        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-300 text-xs font-semibold uppercase">
              {user?.username?.[0] ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.username}</p>
            <p className="text-white/40 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="text-white/30 hover:text-white/70 transition-colors p-1 rounded"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <Link
          to="/profile"
          className={`mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive('/profile')
              ? 'bg-blue-600/20 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <UserCircle className="w-4 h-4 flex-shrink-0 text-white/40" />
          <span>Profile</span>
        </Link>
      </div>
    </aside>
  )
}
