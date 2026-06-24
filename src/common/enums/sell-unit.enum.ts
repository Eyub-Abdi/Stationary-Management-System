/**
 * The packaging unit a product line is transacted in. Input-only (it is not
 * persisted as an enum — lines snapshot the resolved unit label + size instead),
 * so it lives here rather than in the Prisma schema.
 */
export enum SellUnit {
  BASE = 'BASE', // individual pieces (the smallest sellable unit)
  BULK = 'BULK', // whole packaging units (box, carton, ream…)
}
