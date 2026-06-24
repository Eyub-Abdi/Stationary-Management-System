import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen flex-col lg:ml-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-gutter p-4 sm:p-container-padding">
            <Outlet />
          </div>
        </main>
        <footer className="border-t border-outline-variant px-6 py-4">
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-on-surface-variant sm:flex-row">
            <p className="text-body-sm">© {new Date().getFullYear()} StatioPro ERP · KJ Stationery</p>
            <p className="text-label-caps uppercase tracking-wide">Stationery Management System v1.0</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
