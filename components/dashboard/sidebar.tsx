'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  BarChart3,
  Settings,
  ChevronLeft,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  { href: '/dashboard/employees', label: 'Employees', icon: Users },
  { href: '/dashboard/time-off', label: 'Time Off', icon: Clock },
  { href: '/dashboard/availability', label: 'Availability', icon: CalendarClock },
  { href: '/dashboard/shift-generator', label: 'Shift Generator', icon: Wand2 },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } =
    useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'relative hidden shrink-0 flex-col border-r border-border/60 bg-card transition-all duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
        aria-label="Sidebar navigation"
      >
        <div className="flex h-16 items-center gap-2 border-b border-border/60 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CalendarClock className="h-5 w-5" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-base font-semibold tracking-tight">ShiftWise</span>
          )}
        </div>
        <NavList collapsed={sidebarCollapsed} />
        <div className="border-t border-border/60 p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform',
                sidebarCollapsed && 'rotate-180'
              )}
            />
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card shadow-xl"
            aria-label="Mobile navigation"
          >
            <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <span className="text-base font-semibold tracking-tight">ShiftWise</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavList collapsed={false} onNavigate={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
