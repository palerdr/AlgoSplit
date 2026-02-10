import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  History,
  Layers,
  BarChart3,
  GitCompareArrows,
  Library,
  Calculator,
  Settings,
  LogOut,
  Scale,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workout', icon: Dumbbell, label: 'Workout' },
  { to: '/splits', icon: Layers, label: 'Splits' },
  { to: '/analysis', icon: BarChart3, label: 'Analysis' },
  { to: '/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/compare', icon: GitCompareArrows, label: 'Compare' },
  { to: '/programs', icon: CalendarDays, label: 'Programs' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/exercises', icon: Library, label: 'Exercises' },
  { to: '/bodyweight', icon: Scale, label: 'Bodyweight' },
  { to: '/tools', icon: Calculator, label: 'Tools' },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-charcoal border-r border-white/8 flex flex-col">
      {/* Logo */}
      <Link to="/" className="h-14 flex items-center px-4 border-b border-white/8 hover:bg-steel/50 transition-colors">
        <h1 className="text-lg font-bold text-foreground">
          Algo<span className="text-crimson">Split</span>
        </h1>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-crimson/10 text-crimson'
                  : 'text-secondary hover:text-foreground hover:bg-steel'
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-white/8">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-crimson/10 text-crimson'
                : 'text-secondary hover:text-foreground hover:bg-steel'
            )
          }
        >
          <Settings size={18} />
          Settings
        </NavLink>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-secondary hover:text-foreground hover:bg-steel transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
        <div className="mt-2 px-3 py-2">
          <p className="text-xs text-muted truncate">{user?.email}</p>
        </div>
      </div>
    </aside>
  );
}
