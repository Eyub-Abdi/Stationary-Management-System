import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { EmptyState } from '@/components/ui';

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
