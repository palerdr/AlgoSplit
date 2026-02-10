import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  History,
  Layers,
  BarChart3,
  GitCompareArrows,
  TrendingUp,
  CalendarDays,
  Library,
  Scale,
  Calculator,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/workout', icon: Dumbbell, label: 'Workout' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/splits', icon: Layers, label: 'Splits' },
  { to: '/analysis', icon: BarChart3, label: 'Analysis' },
  { to: '/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/compare', icon: GitCompareArrows, label: 'Compare' },
  { to: '/programs', icon: CalendarDays, label: 'Programs' },
  { to: '/exercises', icon: Library, label: 'Exercises' },
  { to: '/bodyweight', icon: Scale, label: 'Weight' },
  { to: '/tools', icon: Calculator, label: 'Tools' },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-charcoal border-t border-white/8 md:hidden z-50">
      <div className="flex items-center h-16 pb-safe">
        {/* Scrollable nav items */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-1 py-2 px-4 shrink-0 transition-colors min-w-[64px]',
                    isActive
                      ? 'text-crimson'
                      : 'text-secondary'
                  )
                }
              >
                <item.icon size={20} />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Anchored "More" button */}
        <div className="shrink-0 border-l border-white/8">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 py-2 px-3 transition-colors min-w-[56px]',
                isActive
                  ? 'text-crimson'
                  : 'text-secondary'
              )
            }
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">More</span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
