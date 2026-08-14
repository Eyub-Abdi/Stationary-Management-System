import { createContext, useContext } from 'react';
import { useCurrentCashSession } from '@/hooks/useCash';
import { useAuth } from './AuthProvider';
import type { CashSession } from '@/types';

interface CashSessionCtx {
  /** The shared session everything is posted to — undefined when the till is closed. */
  session: CashSession | undefined;
  isLoading: boolean;
}

const Ctx = createContext<CashSessionCtx | null>(null);

/**
 * The whole shop works out of ONE cash session. Rather than each station
 * remembering a session of its own (which drifted: staff left sessions open,
 * the next person opened another, and takings landed in the wrong drawer), we
 * simply read whichever session is open on the server and poll for changes —
 * so opening or closing the till on one machine is reflected on all of them.
 */
export function CashSessionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { data: session, isLoading } = useCurrentCashSession(isAuthenticated);

  return (
    <Ctx.Provider
      value={{
        session: session?.status === 'OPEN' ? session : undefined,
        isLoading: isAuthenticated ? isLoading : false,
      }}
    >
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
