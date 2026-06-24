import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { reportError } from '../observability/error-reporter';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
  path: string;
  method: string;
  timestamp: string;
  requestId: string;
}

/**
 * Global exception filter producing a single consistent error envelope.
 * Maps Prisma known errors to appropriate HTTP statuses and never leaks
 * stack traces or SQL details to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      (request.headers['x-request-id'] as string) ?? randomUUID();

    const { status, error, message, code } = this.resolve(exception);

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      code,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    };

    if (status >= 500) {
      const userId = (request as { user?: { id?: string } }).user?.id ?? null;
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} (user:${userId}) -> ${status}`,
        (exception as Error)?.stack,
      );
      // Ship to external error tracking when configured (no-op otherwise).
      reportError(exception, {
        requestId,
        method: request.method,
        path: request.url,
        userId,
      });
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} -> ${status}: ${JSON.stringify(
          message,
        )}`,
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const status = exception.getStatus();
      if (typeof res === 'string') {
        return { status, error: exception.name, message: res };
      }
      const r = res as { message?: string | string[]; error?: string };
      return {
        status,
        error: r.error ?? exception.name,
        message: r.message ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'BadRequest',
        message: 'Invalid query parameters',
        code: 'PRISMA_VALIDATION',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    };
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[])?.join(', ') ?? 'field';
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `Duplicate value violates unique constraint on: ${target}`,
          code: e.code,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: 'The requested record was not found',
          code: e.code,
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'BadRequest',
          message: 'Related record does not exist (foreign key constraint)',
          code: e.code,
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'Transaction conflict, please retry',
          code: e.code,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'DatabaseError',
          message: 'A database error occurred',
          code: e.code,
        };
    }
  }
}
