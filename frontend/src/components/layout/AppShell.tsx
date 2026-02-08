import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function AppShell() {
  return (
    <div className="min-h-screen bg-iron">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  );
}
