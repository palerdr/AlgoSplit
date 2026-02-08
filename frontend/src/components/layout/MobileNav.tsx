import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  History,
  Layers,
  BarChart3,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/workout', icon: Dumbbell, label: 'Workout' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/splits', icon: Layers, label: 'Splits' },
  { to: '/analysis', icon: BarChart3, label: 'Analysis' },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-charcoal border-t border-white/8 px-2 pb-safe md:hidden z-50">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-md transition-colors',
                isActive
                  ? 'text-crimson'
                  : 'text-secondary'
              )
            }
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-md transition-colors',
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
    </nav>
  );
}
