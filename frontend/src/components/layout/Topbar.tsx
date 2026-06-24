import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn, currency, initials } from '@/lib/utils';
import { Icon } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useActiveCashSession } from '@/providers/CashSessionProvider';
import { useLowStockProducts } from '@/hooks/useProducts';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { session } = useActiveCashSession();
  const { data: lowStock } = useLowStockProducts();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const lowCount = lowStock?.length ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-outline-variant bg-surface-bright px-4 lg:px-gutter">
      <div className="flex flex-1 items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container lg:hidden"
          aria-label="Open menu"
        >
          <Icon name="menu" size={24} />
        </button>
        <div className="relative hidden w-full max-w-md sm:block">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            placeholder="Search invoices, products, logs…"
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface-container-low pl-10 pr-4 text-body-sm outline-none transition-all focus:border-secondary focus:ring-2 focus:ring-secondary/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Cash session pill */}
        <Link
          to="/cash"
          className={cn(
            'hidden items-center gap-2 rounded-full border px-3.5 py-1.5 transition-colors md:flex',
            session
              ? 'border-secondary-fixed bg-secondary-container text-on-secondary-container'
              : 'border-outline-variant bg-surface-container text-on-surface-variant',
          )}
        >
          <Icon name="fiber_manual_record" size={12} filled className={session ? 'text-secondary' : 'text-outline'} />
          <span className="text-label-caps uppercase">
            Cash {session ? 'Open' : 'Closed'}
          </span>
          {session?.breakdown && (
            <span className="ml-1 font-mono-data text-[12px]">
              {currency(session.breakdown.expectedAmount)}
            </span>
          )}
        </Link>

        <ThemeToggle />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label="Notifications"
          >
            <Icon name="notifications" size={22} />
            {lowCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-on-error">
                {lowCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="animate-scale-in absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
              <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                <p className="text-body-sm font-semibold text-on-surface">Notifications</p>
                <span className="text-[11px] text-on-surface-variant">{lowCount} low stock</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {lowCount === 0 ? (
                  <p className="px-4 py-6 text-center text-body-sm text-on-surface-variant">
                    You're all caught up.
                  </p>
                ) : (
                  lowStock!.slice(0, 6).map((p) => (
                    <Link
                      to="/inventory"
                      key={p.sku}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-error-container text-error">
                        <Icon name="inventory" size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium text-on-surface">{p.name}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {p.currentStock} left · min {p.minStockLevel}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden h-8 w-px bg-outline-variant sm:block" />

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-container"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-on-primary">
              {user ? initials(user.fullName) : '—'}
            </span>
            <span className="hidden text-left lg:block">
              <span className="block text-[13px] font-semibold leading-tight text-on-surface">
                {user?.fullName}
              </span>
              <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant">
                {user?.role}
              </span>
            </span>
            <Icon name="expand_more" size={18} className="hidden text-on-surface-variant lg:block" />
          </button>
          {menuOpen && (
            <div className="animate-scale-in absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
              <div className="border-b border-outline-variant px-4 py-3">
                <p className="truncate text-body-sm font-semibold text-on-surface">{user?.fullName}</p>
                <p className="truncate text-[12px] text-on-surface-variant">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body-sm text-on-surface hover:bg-surface-container-low"
              >
                <Icon name="settings" size={18} /> Settings
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-body-sm text-error hover:bg-error-container/40"
              >
                <Icon name="logout" size={18} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
