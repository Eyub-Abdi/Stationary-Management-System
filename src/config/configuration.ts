/**
 * Typed application configuration, loaded once at bootstrap and validated by
 * `env.validation.ts`. Access via NestJS ConfigService with full type-safety.
 */
export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  apiVersion: string;
  appName: string;
  corsOrigins: string[];
  currency: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  accessSecret: string;
  accessTtl: number; // seconds
  refreshSecret: string;
  refreshTtl: number; // seconds
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  ttl: number;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
  throttle: ThrottleConfig;
}

export default (): Configuration => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    apiVersion: process.env.API_VERSION ?? 'v1',
    appName: process.env.APP_NAME ?? 'KJ Stationery Management System',
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
    currency: process.env.CURRENCY ?? 'TZS',
  },
  database: {
    url: process.env.DATABASE_URL as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ttl: parseInt(process.env.REDIS_TTL ?? '60', 10),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
});
