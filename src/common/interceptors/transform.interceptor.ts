import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Wraps successful responses in a consistent envelope and serializes any
 * Prisma.Decimal values to strings (preserving precision; never floats).
 * Paginated payloads (objects already shaped as { data, meta }) pass through
 * with their meta preserved.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | unknown>
{
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        const data = this.serialize(payload);
        if (data && typeof data === 'object' && 'meta' in data && 'data' in data) {
          return { success: true, ...data, timestamp: new Date().toISOString() };
        }
        return { success: true, data, timestamp: new Date().toISOString() };
      }),
    );
  }

  private serialize(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (value instanceof Prisma.Decimal) return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.serialize(v));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.serialize(v);
      }
      return out;
    }
    return value;
  }
}
