/** Cross-cutting metadata keys & shared constants. */
export const ROLES_KEY = 'roles';
export const IS_PUBLIC_KEY = 'isPublic';

/** Money precision used across the system. Amounts are Decimal(14,2). */
export const MONEY_DECIMAL_PLACES = 2;

/** Header carrying a client idempotency key for unsafe POST operations. */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
