import type { AuthUser } from '@/types';

// Persisted auth state. "Remember me" => localStorage, otherwise sessionStorage.
const ACCESS = 'sp.access';
const REFRESH = 'sp.refresh';
const USER = 'sp.user';
const PERSIST = 'sp.persist';

function store(): Storage {
  return localStorage.getItem(PERSIST) === '1' ? localStorage : sessionStorage;
}

export const tokenStore = {
  get accessToken(): string | null {
    return localStorage.getItem(ACCESS) ?? sessionStorage.getItem(ACCESS);
  },
  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH) ?? sessionStorage.getItem(REFRESH);
  },
  get user(): AuthUser | null {
    const raw = localStorage.getItem(USER) ?? sessionStorage.getItem(USER);
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  set(tokens: { accessToken: string; refreshToken: string }, user: AuthUser, remember: boolean) {
    localStorage.setItem(PERSIST, remember ? '1' : '0');
    const s = store();
    s.setItem(ACCESS, tokens.accessToken);
    s.setItem(REFRESH, tokens.refreshToken);
    if (user) s.setItem(USER, JSON.stringify(user));
  },
  updateTokens(tokens: { accessToken: string; refreshToken: string }) {
    const s = store();
    s.setItem(ACCESS, tokens.accessToken);
    s.setItem(REFRESH, tokens.refreshToken);
  },
  updateUser(user: AuthUser) {
    if (!user) return;
    const s = store();
    s.setItem(USER, JSON.stringify(user));
  },
  clear() {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(ACCESS);
      s.removeItem(REFRESH);
      s.removeItem(USER);
    });
    localStorage.removeItem(PERSIST);
  },
};
