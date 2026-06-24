import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { tokenStore } from './tokenStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** Shape of the backend error envelope (AllExceptionsFilter). */
export interface ApiErrorBody {
  success?: false;
  statusCode?: number;
  message?: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;
  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Pull a human message out of NestJS class-validator / Http errors. */
export function extractMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    const m = err.body?.message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- 401 -> single-flight refresh -> retry ---------------------------------

let refreshing: Promise<string | null> | null = null;
let onAuthFailure: (() => void) | null = null;

/** Lets the AuthProvider react (redirect to login) when refresh fails. */
export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.refreshToken;
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    const data = res.data?.data ?? res.data;
    tokenStore.updateTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return data.accessToken as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status ?? 0;
    const isAuthEndpoint = original?.url?.includes('/auth/');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      tokenStore.clear();
      onAuthFailure?.();
    }

    throw new ApiError(
      (error.response?.data?.message as string) || error.message,
      status,
      error.response?.data,
    );
  },
);

/** Unwrap the { success, data } envelope for normal resources. */
export async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}
