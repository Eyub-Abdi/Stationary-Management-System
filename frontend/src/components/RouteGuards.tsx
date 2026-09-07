import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type PermissionKey } from '@/providers/AuthProvider';
import { useAppSettings, type AppSettings } from '@/hooks/useAppSettings';
import { EmptyState, LoadingState } from '@/components/ui';
import type { FeatureKey } from '@/components/layout/nav';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <EmptyState
        icon="lock"
        title="Administrator access required"
        description="You don't have permission to view this page. Contact an administrator if you believe this is a mistake."
        className="py-24"
      />
    );
  }
  return <>{children}</>;
}

/** Admins, or staff granted the given permission, may view the page. */
export function PermissionRoute({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon="lock"
        title="Permission required"
        description="You don't have permission to view this page. Ask an administrator to grant it in Users."
        className="py-24"
      />
    );
  }
  return <>{children}</>;
}

/** Copy for a screen an admin has switched off, keyed by the setting. */
const FEATURES: Record<
  FeatureKey,
  { icon: string; title: string; setting: string; enabled: (s: AppSettings) => boolean }
> = {
  openingStock: {
    icon: 'flag',
    title: 'Opening stock is switched off',
    setting: 'Settings, under Business',
    enabled: (s) => s.openingStockEnabled,
  },
};

/**
 * A page that only exists while its setting is on. Guarded here as well as in
 * the sidebar, so a bookmark or a typed URL cannot outlive the switch.
 */
export function FeatureRoute({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { isAdmin } = useAuth();
  const { data: settings, isLoading } = useAppSettings();
  const { icon, title, setting, enabled } = FEATURES[feature];

  // Wait rather than guess: rendering the off state first would flash it at
  // everyone who has the screen switched on.
  if (isLoading) return <LoadingState />;
  if (!settings || !enabled(settings)) {
    return (
      <EmptyState
        icon={icon}
        title={title}
        description={
          isAdmin
            ? `Switch it on in ${setting} for as long as you need it.`
            : `Ask an administrator to switch it on in ${setting}.`
        }
        className="py-24"
      />
    );
  }
  return <>{children}</>;
}
