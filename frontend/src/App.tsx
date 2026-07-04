import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminRoute, PermissionRoute, ProtectedRoute } from '@/components/RouteGuards';
import { useAuth } from '@/providers/AuthProvider';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PosPage from '@/pages/PosPage';
import SalesPage from '@/pages/SalesPage';
import SaleDetailPage from '@/pages/SaleDetailPage';
import ProductsPage from '@/pages/ProductsPage';
import ProductDetailPage from '@/pages/ProductDetailPage';
import ProductFormPage from '@/pages/ProductFormPage';
import ServicesPage from '@/pages/ServicesPage';
import InventoryPage from '@/pages/InventoryPage';
import PurchasesPage from '@/pages/PurchasesPage';
import CreatePurchasePage from '@/pages/CreatePurchasePage';
import PurchaseDetailPage from '@/pages/PurchaseDetailPage';
import CustomersPage from '@/pages/CustomersPage';
import CustomerDetailPage from '@/pages/CustomerDetailPage';
import SuppliersPage from '@/pages/SuppliersPage';
import SupplierDetailPage from '@/pages/SupplierDetailPage';
import ExpensesPage from '@/pages/ExpensesPage';
import OfficePurchasesPage from '@/pages/OfficePurchasesPage';
import OfficePurchaseDetailPage from '@/pages/OfficePurchaseDetailPage';
import CashPage from '@/pages/CashPage';
import ReportsPage from '@/pages/ReportsPage';
import ProfitPage from '@/pages/ProfitPage';
import MovementPage from '@/pages/MovementPage';
import UsersPage from '@/pages/UsersPage';
import UserDetailPage from '@/pages/UserDetailPage';
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
        <Route path="/sales/:id" element={<SaleDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route
          path="/products/new"
          element={
            <PermissionRoute permission="products">
              <ProductFormPage />
            </PermissionRoute>
          }
        />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route
          path="/products/:id/edit"
          element={
            <PermissionRoute permission="products">
              <ProductFormPage />
            </PermissionRoute>
          }
        />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route
          path="/purchases"
          element={
            <PermissionRoute permission="purchases">
              <PurchasesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/purchases/new"
          element={
            <PermissionRoute permission="purchases">
              <CreatePurchasePage />
            </PermissionRoute>
          }
        />
        <Route
          path="/purchases/:id"
          element={
            <PermissionRoute permission="purchases">
              <PurchaseDetailPage />
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
        <Route
          path="/suppliers/:id"
          element={
            <PermissionRoute permission="suppliers">
              <SupplierDetailPage />
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
        <Route
          path="/office-purchases/:id"
          element={
            <PermissionRoute permission="officePurchases">
              <OfficePurchaseDetailPage />
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
          path="/users/:id"
          element={
            <PermissionRoute permission="users">
              <UserDetailPage />
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
