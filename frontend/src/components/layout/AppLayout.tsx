import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSED_KEY = 'sp.sidebarCollapsed';

/** Editable fields swallow the shortcut so Ctrl+B stays available for the OS/browser there. */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Which of the two desktop widths the shop's machine sits at, remembered per
  // browser: a cashier on a small screen keeps the rail, an admin keeps labels.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  );
  const { data: settings } = useAppSettings();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !isTyping(e.target)) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin] duration-200 ease-out',
          collapsed ? 'lg:ml-[76px]' : 'lg:ml-64',
        )}
      >
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-gutter p-4 sm:p-container-padding">
            <Outlet />
          </div>
        </main>
        <footer className="border-t border-outline-variant px-6 py-4">
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-on-surface-variant sm:flex-row">
            <p className="text-body-sm">© {new Date().getFullYear()} STMS · {settings?.businessName ?? 'KJ Stationery'}</p>
            <p className="text-label-caps uppercase tracking-wide">Stationery Management System v1.0</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
