import { createContext, useContext, useEffect, useState } from 'react';
import { useCashSessionSummary } from '@/hooks/useCash';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';
import type { CashSession } from '@/types';

const KEY = 'sp.activeCashSession';

interface CashSessionCtx {
  activeId: string | null;
  session: CashSession | undefined;
  isLoading: boolean;
  setActiveId: (id: string | null) => void;
}

const Ctx = createContext<CashSessionCtx | null>(null);

export function CashSessionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [activeId, setActiveIdState] = useState<string | null>(() => localStorage.getItem(KEY));

  const setActiveId = (id: string | null) => {
    setActiveIdState(id);
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  };

  // Admins can discover an existing open session on login.
  useEffect(() => {
    if (!isAuthenticated || activeId || !isAdmin) return;
    let cancelled = false;
    api
      .get('/cash-sessions', { params: { status: 'OPEN', limit: 1 } })
      .then((res) => {
        const list = (res.data?.data ?? []) as CashSession[];
        if (!cancelled && list[0]) setActiveId(list[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAdmin]);

  const { data: session, isLoading, error } = useCashSessionSummary(activeId);

  // If the stored session is gone or already closed, drop it.
  useEffect(() => {
    if (error) setActiveId(null);
    if (session && session.status === 'CLOSED') setActiveId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, session]);

  return (
    <Ctx.Provider value={{ activeId, session: session?.status === 'OPEN' ? session : undefined, isLoading, setActiveId }}>
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveCashSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useActiveCashSession must be used within CashSessionProvider');
  return ctx;
}
