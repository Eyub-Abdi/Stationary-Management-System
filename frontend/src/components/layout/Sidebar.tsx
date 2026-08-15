import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useAppSettings } from '@/hooks/useAppSettings';
import { visibleNav } from './nav';

/**
 * Collapsing is a desktop affordance: on mobile the sidebar is a drawer that is
 * either open or off-screen, so every collapsed style is `lg:`-prefixed and the
 * drawer keeps its labels regardless of the stored preference.
 */
export function Sidebar({
  mobileOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { user, can } = useAuth();
  const { data: settings } = useAppSettings();
  const items = visibleNav(user?.role, can);
  const businessName = settings?.businessName ?? 'KJ Stationery';

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-on-background/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-hidden whitespace-nowrap border-r border-outline-variant bg-surface-container-low transition-[width,transform] duration-200 ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            'flex items-center gap-3 px-5 py-5',
            collapsed && 'lg:flex-col lg:gap-2 lg:px-0 lg:py-4',
          )}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
            <img src="/st-logo.png" alt="Stationery Management System" className="h-full w-full object-contain p-0.5" />
          </div>
          <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
            <h1 className="text-h3 font-bold leading-tight text-on-surface">STMS</h1>
            <p className="text-[11px] uppercase tracking-widest text-on-surface-variant">
              {user?.role === 'ADMIN' ? 'Admin Console' : 'Staff Console'}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} sidebar`}
            aria-expanded={!collapsed}
            className={cn(
              'ml-auto hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-on-surface-variant outline-none transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:ring-2 focus-visible:ring-secondary/40 lg:grid',
              collapsed && 'lg:ml-0',
            )}
          >
            <Icon name={collapsed ? 'left_panel_open' : 'left_panel_close'} size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            'scrollbar-none flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2',
            collapsed && 'lg:items-center lg:px-2',
          )}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors',
                  collapsed && 'lg:w-11 lg:justify-center lg:px-0',
                  isActive
                    ? 'bg-primary-container font-semibold text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={22} filled={isActive} className="shrink-0" />
                  <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer instance card */}
        <div className={cn('border-t border-outline-variant p-4', collapsed && 'lg:p-3')}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5',
              collapsed && 'lg:justify-center lg:bg-transparent lg:px-0',
            )}
            title={collapsed ? `${businessName} · ${settings?.branchName ?? 'Main Branch'}` : undefined}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed-dim text-on-primary-fixed">
              <Icon name="store" size={20} />
            </div>
            <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
              <p className="truncate text-[13px] font-bold text-on-surface">{businessName}</p>
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
