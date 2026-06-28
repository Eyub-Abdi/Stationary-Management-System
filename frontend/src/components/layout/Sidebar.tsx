import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useAppSettings } from '@/hooks/useAppSettings';
import { visibleNav } from './nav';

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: settings } = useAppSettings();
  const items = visibleNav(user?.role);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-on-background/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-outline-variant bg-surface-container-low transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
            <img src="/st-logo.png" alt="Stationery Management System" className="h-full w-full object-contain p-0.5" />
          </div>
          <div>
            <h1 className="text-h3 font-bold leading-tight text-on-surface">StatioPro</h1>
            <p className="text-[11px] uppercase tracking-widest text-on-surface-variant">
              {user?.role === 'ADMIN' ? 'Admin Console' : 'Staff Console'}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="scrollbar-none flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary-container font-semibold text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={22} filled={isActive} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer instance card */}
        <div className="border-t border-outline-variant p-4">
          <div className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed-dim text-on-primary-fixed">
              <Icon name="store" size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-on-surface">
                {settings?.businessName ?? 'KJ Stationery'}
              </p>
              <p className="truncate text-[10px] uppercase tracking-widest text-on-surface-variant">
                {settings?.branchName ?? 'Main Branch'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
