// ============================================================================
// Shared domain types mirroring the NestJS / Prisma API contracts.
// Money fields arrive as strings (Decimal serialized) — keep them as strings.
// ============================================================================

export type Role = 'ADMIN' | 'STAFF';
export type ProductStatus = 'ACTIVE' | 'INACTIVE';
export type ServiceStatus = 'ACTIVE' | 'INACTIVE';
export type PricingType = 'PER_PAGE' | 'FIXED';
export type SaleItemType = 'PRODUCT' | 'SERVICE';
export type SaleStatus = 'COMPLETED' | 'VOIDED';
export type InventoryMovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN';
export type ExpenseCategory =
  | 'RENT'
  | 'SALARY'
  | 'ELECTRICITY'
  | 'INTERNET'
  | 'TONER'
  | 'PAPER'
  | 'TRANSPORT'
  | 'FOOD'
  | 'OFFICE_SUPPLIES'
  | 'MISCELLANEOUS';
export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'DEPOSIT' | 'WITHDRAWAL';
export type PaymentMethod = 'CASH' | 'CREDIT';
export type SellUnit = 'BASE' | 'BULK';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  success: true;
  data: T[];
  meta: PageMeta;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: AuthUser;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface Unit {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// A sellable variant of a product — its own SKU, price, stock and cost.
export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  label: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  buyingPrice: string;
  bulkSellingPrice: string | null;
  currentStock: number;
  minStockLevel: number;
  isDefault: boolean;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  category?: Category | null;
  // Dual unit of measure (shared by all variants). Stock is in base units.
  baseUnit: string;
  bulkUnit: string | null;
  unitSize: number;
  status: ProductStatus;
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

// One product a service option consumes (a bill-of-materials line).
export interface ServiceComponent {
  id: string;
  variantId: string;
  /** Whole base units consumed per page (perPage) or per job. */
  qty: number;
  perPage: boolean;
  variant?: {
    id: string;
    label: string;
    sku: string;
    currentStock: number;
    product: { name: string; baseUnit: string };
  };
}

// A priced option of a service, e.g. "A4" / "A3".
export interface ServiceVariant {
  id: string;
  serviceId: string;
  label: string;
  unitPrice: string;
  isDefault: boolean;
  status: ServiceStatus;
  /** Products this option consumes (its bill of materials). Empty = none. */
  components: ServiceComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  name: string;
  /** Optional Material Symbols icon name for display. */
  icon: string | null;
  pricingType: PricingType;
  status: ServiceStatus;
  variants: ServiceVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  balance: string;
  /** Most recent credit purchase date; null if none. Present in list rows. */
  lastCreditPurchaseAt?: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: SupplierPayment[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  balance: string;
  creditLimit: string | null;
  /** Most recent completed credit sale date; null if none. Present in list rows. */
  lastCreditSaleAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sales?: Array<
    Pick<Sale, 'id' | 'invoiceNumber' | 'total' | 'amountPaid' | 'amountDue' | 'status' | 'createdAt'> & {
      user?: { fullName: string } | null;
      /** Repayments applied to this specific invoice (newest first). */
      paymentAllocations?: SalePaymentAllocation[];
    }
  >;
  payments?: CustomerPayment[];
}

export interface AgingRow {
  id: string;
  name: string;
  phone: string | null;
  balance: string;
  creditLimit: string | null;
  current: string;
  days31to60: string;
  days61to90: string;
  days90plus: string;
  oldestInvoice: string | null;
}

/** One repayment's slice applied to a single invoice. */
export interface SalePaymentAllocation {
  id: string;
  amount: string;
  createdAt: string;
  payment?: {
    notes: string | null;
    user?: { fullName: string } | null;
  } | null;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  userId: string;
  user?: { fullName: string };
  cashSessionId: string | null;
  saleId: string | null;
  amount: string;
  notes: string | null;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  userId: string;
  user?: { fullName: string };
  cashSessionId: string | null;
  purchaseId: string | null;
  amount: string;
  notes: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  itemType: SaleItemType;
  productId: string | null;
  serviceId: string | null;
  nameSnapshot: string;
  unitPriceSnapshot: string;
  quantity: number;
  unitLabel: string;
  unitSize: number;
  pages: number | null;
  discount: string;
  lineTotal: string;
  lineCogs: string;
  returnedQuantity: number;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  transactionNumber: string;
  userId: string;
  user?: { fullName: string };
  cashSessionId: string | null;
  customerId: string | null;
  customer?: { id?: string; name: string; phone?: string | null } | null;
  subtotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  amountDue: string;
  cashReceived: string;
  changeGiven: string;
  totalCogs: string;
  status: SaleStatus;
  notes: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  items?: SaleItem[];
  _count?: { items: number };
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitLabel: string;
  unitSize: number;
  unitCost: string;
  lineTotal: string;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string | null;
  supplier?: Supplier | null;
  userId: string;
  user?: { fullName: string };
  purchaseDate: string;
  totalCost: string;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  amountDue: string;
  notes: string | null;
  createdAt: string;
  items?: PurchaseItem[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  variantId: string;
  product?: { name: string; sku: string };
  variant?: { sku: string; label: string };
  type: InventoryMovementType;
  quantity: number;
  beforeQty: number;
  afterQty: number;
  unitCost: string | null;
  userId: string | null;
  user?: { fullName: string } | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  expenseId: string;
  name: string;
  quantity: number;
  unitCost: string;
  lineTotal: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: string;
  expenseDate: string;
  description: string | null;
  supplierName?: string | null;
  userId: string;
  user?: { fullName: string };
  cashSessionId: string | null;
  items?: ExpenseItem[];
  createdAt: string;
}

export interface CashMovement {
  id: string;
  cashSessionId: string;
  type: CashMovementType;
  amount: string;
  userId: string;
  notes: string | null;
  createdAt: string;
}

export interface CashBreakdown {
  openingBalance: string;
  cashSales: string;
  customerPayments: string;
  deposits: string;
  refunds: string;
  withdrawals: string;
  expenses: string;
  purchases: string;
  supplierPayments: string;
  expectedAmount: string;
}

export interface CashSession {
  id: string;
  userId: string;
  user?: { fullName: string };
  openingBalance: string;
  status: CashSessionStatus;
  openedAt: string;
  closedAt: string | null;
  expectedAmount: string | null;
  actualAmount: string | null;
  variance: string | null;
  notes: string | null;
  movements?: CashMovement[];
  breakdown?: CashBreakdown;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user?: { fullName: string; email: string; role: Role } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ---- Reports --------------------------------------------------------------

export interface FinancialSummary {
  range: { from: string | null; to: string | null };
  grossSales: string;
  refunds: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  expenses: string;
  netProfit: string;
  saleCount: number;
}

export interface SalesSeriesPoint {
  period: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  saleCount: number;
}

export interface ExpenseByCategory {
  category: ExpenseCategory;
  total: string;
  count: number;
}

export interface StockLevelRow {
  sku: string;
  name: string;
  currentStock: number;
  minStockLevel: number;
  valuation: string;
}

export interface LowStockRow {
  sku: string;
  name: string;
  currentStock: number;
  minStockLevel: number;
}

export interface TopProductRow {
  productId: string;
  name: string;
  units_sold: string | number;
  revenue: string;
  cogs: string;
}

export interface TopServiceRow {
  serviceVariantId: string;
  name: string;
  jobs: number;
  revenue: string;
}

export interface UserActivityRow {
  userId: string;
  name: string;
  role: Role;
  sale_count: string | number;
  revenue: string;
}

export interface ProductMovementRow {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  currentStock: number;
  // Base units sold in the selected range, net of returns.
  unitsSold: number;
  // Most recent completed sale, all-time. Null = never sold.
  lastSoldAt: string | null;
}

export interface ProductProfitRow {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  bulkUnit: string | null;
  unitSize: number;
  buyingPrice: string;
  sellingPrice: string;
  bulkSellingPrice: string | null;
  // Net of returns. qtyBase is in base units (pieces); wholesale/retail are the
  // count of transacted units sold in a bulk pack vs as single pieces.
  qtyBase: number;
  wholesaleUnits: number;
  retailUnits: number;
  revenue: string;
  cogs: string;
  grossProfit: string;
  margin: string;
}
