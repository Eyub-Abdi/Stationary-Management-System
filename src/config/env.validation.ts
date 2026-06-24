import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Fail-fast environment validation. The process refuses to boot if required
 * secrets/connection strings are missing or weak — critical for production.
 */
class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  JWT_ACCESS_TTL = 900;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  JWT_REFRESH_TTL = 604800;

  @IsString()
  @IsOptional()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  REDIS_PORT = 6379;

  // Optional external error tracking. When set (and @sentry/node installed),
  // 5xx errors are shipped to Sentry. See common/observability/error-reporter.
  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${messages}`);
  }
  return validated;
}
