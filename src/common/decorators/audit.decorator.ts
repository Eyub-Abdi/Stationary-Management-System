import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit_action';

export interface AuditMeta {
  action: string;
  entityType: string;
}

/**
 * Declarative audit marker consumed by AuditInterceptor. The interceptor records
 * an immutable AuditLog row when the handler succeeds. Note: critical financial
 * actions ALSO write their audit row inside the DB transaction itself — this
 * decorator is for lighter-weight CRUD actions.
 */
export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMeta);
