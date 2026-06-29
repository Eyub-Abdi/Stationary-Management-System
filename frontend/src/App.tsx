import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminRoute, PermissionRoute, ProtectedRoute } from '@/components/RouteGuards';
import { useAuth } from '@/providers/AuthProvider';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PosPage from '@/pages/PosPage';
import SalesPage from '@/pages/SalesPage';
import ProductsPage from '@/pages/ProductsPage';
import ServicesPage from '@/pages/ServicesPage';
import InventoryPage from '@/pages/InventoryPage';
import PurchasesPage from '@/pages/PurchasesPage';
import CustomersPage from '@/pages/CustomersPage';
import SuppliersPage from '@/pages/SuppliersPage';
import ExpensesPage from '@/pages/ExpensesPage';
import OfficePurchasesPage from '@/pages/OfficePurchasesPage';
import CashPage from '@/pages/CashPage';
import ReportsPage from '@/pages/ReportsPage';
import ProfitPage from '@/pages/ProfitPage';
import MovementPage from '@/pages/MovementPage';
import UsersPage from '@/pages/UsersPage';
import ActivityLogsPage from '@/pages/ActivityLogsPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route
          path="/purchases"
          element={
            <PermissionRoute permission="purchases">
              <PurchasesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <PermissionRoute permission="suppliers">
              <SuppliersPage />
            </PermissionRoute>
          }
        />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route
          path="/office-purchases"
          element={
            <PermissionRoute permission="officePurchases">
              <OfficePurchasesPage />
            </PermissionRoute>
          }
        />
        <Route path="/cash" element={<CashPage />} />
        <Route
          path="/reports"
          element={
            <PermissionRoute permission="reports">
              <ReportsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/profit"
          element={
            <PermissionRoute permission="reports">
              <ProfitPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/movement"
          element={
            <PermissionRoute permission="reports">
              <MovementPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PermissionRoute permission="users">
              <UsersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/activity"
          element={
            <AdminRoute>
              <ActivityLogsPage />
            </AdminRoute>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
