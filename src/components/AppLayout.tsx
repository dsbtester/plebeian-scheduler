import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PenSquare,
  ListOrdered,
  FileText,
  CalendarDays,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginArea } from '@/components/auth/LoginArea';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useSchedulerPublish } from '@/hooks/useSchedulerPublish';
import { cn } from '@/lib/utils';

const LOGO_URL = 'https://blossom.ditto.pub/b4404a2ff1e10f618765cfe9f3d28d7f05daccb28466af50d0354021c1b18d3c.jpeg';
const BANNER_URL = 'https://blossom.ditto.pub/464274d3c2b0c9cf737350f10c53759dce07590904c18ec8efa6d96b2ae24069.jpeg';

interface AppLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/compose', label: 'Compose', icon: PenSquare },
  { path: '/queue', label: 'Queue', icon: ListOrdered },
  { path: '/drafts', label: 'Drafts', icon: FileText },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { user } = useCurrentUser();
  const { stats } = useScheduler();

  const isDark = theme === 'dark';

  // Run scheduler publisher on all pages
  useSchedulerPublish();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-3 group" onClick={() => setMobileOpen(false)}>
            <img
              src={LOGO_URL}
              alt="Plebeian"
              className="w-10 h-10 rounded-lg shadow-md shadow-primary/20 group-hover:shadow-primary/40 transition-shadow"
            />
            <div>
              <h1 className="font-display text-base font-bold tracking-tight leading-none uppercase">
                Plebeian
              </h1>
              <p className="text-[10px] text-muted-foreground font-medium tracking-[0.2em] uppercase mt-0.5">
                Scheduler
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map(item => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;

            // Badge counts
            let badge: number | null = null;
            if (item.path === '/drafts') badge = stats.drafts || null;
            if (item.path === '/queue') badge = stats.queued || null;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive && 'text-primary')} />
                <span className="flex-1">{item.label}</span>
                {badge !== null && (
                  <span className="bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 rounded-full min-w-[22px] text-center">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Scheduled count indicator */}
        {stats.scheduled > 0 && (
          <div className="mx-3 mb-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
              <span className="text-xs font-medium text-primary">
                {stats.scheduled} scheduled
              </span>
            </div>
          </div>
        )}

        {/* Bottom section */}
        <div className="p-3 border-t border-border space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
          </Button>
          <LoginArea className="w-full flex" />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Plebeian" className="w-7 h-7 rounded-md" />
            <span className="font-display font-bold text-sm uppercase">Plebeian Scheduler</span>
          </Link>
          <div className="w-10" />
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          {user ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in">
              {/* Banner */}
              <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl shadow-primary/10">
                <img
                  src={BANNER_URL}
                  alt="Plebeian - The Self Sovereign Marketplace"
                  className="w-full h-auto"
                />
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wider">
                  Scheduler
                </h2>
                <p className="text-muted-foreground max-w-md text-sm">
                  Import your Plebeian Market listings, craft promotional notes, and schedule them to go out on Nostr.
                </p>
              </div>
              <LoginArea className="max-w-60" />
              <p className="text-xs text-muted-foreground mt-8">
                Vibed with{' '}
                <a
                  href="https://shakespeare.diy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Shakespeare
                </a>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
