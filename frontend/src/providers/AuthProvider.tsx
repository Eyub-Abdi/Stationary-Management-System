import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAuthFailureHandler, unwrap } from '@/lib/api';
import { tokenStore } from '@/lib/tokenStore';
import type { AuthUser, TokenPair, User } from '@/types';

/** Grantable staff capabilities (admins always have all). */
export type PermissionKey = 'products' | 'services' | 'purchases';

interface AuthCtx {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Admins always true; staff true only when granted that permission. */
  can: (key: PermissionKey) => boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => tokenStore.user);
  const qc = useQueryClient();

  const doLogout = useCallback(async () => {
    const refreshToken = tokenStore.refreshToken;
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        /* best-effort */
      }
    }
    tokenStore.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  // When token refresh fails inside the axios interceptor, drop the session.
  useEffect(() => {
    setAuthFailureHandler(() => {
      tokenStore.clear();
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await api.post('/auth/login', { email, password });
      const data = (res.data?.data ?? res.data) as TokenPair;
      tokenStore.set(
        { accessToken: data.accessToken, refreshToken: data.refreshToken },
        data.user,
        remember,
      );
      setUser(data.user);
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const me = await unwrap<User>(api.get('/auth/me'));
    const authUser: AuthUser = {
      id: me.id,
      email: me.email,
      fullName: me.fullName,
      role: me.role,
      canManageProducts: me.canManageProducts,
      canManageServices: me.canManageServices,
      canManagePurchases: me.canManagePurchases,
    };
    tokenStore.updateUser(authUser);
    setUser(authUser);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const isAdmin = user?.role === 'ADMIN';
    return {
      user,
      isAuthenticated: !!user,
      isAdmin,
      can: (key: PermissionKey) => {
        if (!user) return false;
        if (isAdmin) return true;
        if (key === 'products') return user.canManageProducts;
        if (key === 'services') return user.canManageServices;
        return user.canManagePurchases;
      },
      login,
      logout: doLogout,
      refreshProfile,
    };
  }, [user, login, doLogout, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
