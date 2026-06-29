import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { redisStore } from 'cache-manager-ioredis-yet';
import { ValidationPipe } from '@nestjs/common';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { BackupModule } from './modules/backup/backup.module';
import { CashModule } from './modules/cash/cash.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductsModule } from './modules/products/products.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SalesModule } from './modules/sales/sales.module';
import { ServicesModule } from './modules/services/services.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SharedModule } from './modules/shared/shared.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { SystemModule } from './modules/system/system.module';
import { UnitsModule } from './modules/units/units.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),

    // Cache backend. Defaults to in-memory; set CACHE_DRIVER=redis to use Redis.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const ttl = (config.get<number>('redis.ttl') ?? 60) * 1000;
        if (process.env.CACHE_DRIVER === 'redis') {
          return {
            store: await redisStore({
              host: config.get<string>('redis.host'),
              port: config.get<number>('redis.port'),
              password: config.get<string>('redis.password'),
              ttl,
            }),
          };
        }
        // In-memory store — no external dependency required.
        return { ttl };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
      }),
    }),

    // Infrastructure
    PrismaModule,
    SharedModule,
    AuditModule,

    // Feature modules
    AuthModule,
    UsersModule,
    CategoriesModule,
    UnitsModule,
    ProductsModule,
    ServicesModule,
    SettingsModule,
    SuppliersModule,
    CustomersModule,
    PurchasesModule,
    InventoryModule,
    SalesModule,
    ExpensesModule,
    CashModule,
    ReportsModule,
    UploadsModule,
    BackupModule,
    SystemModule,
    HealthModule,
  ],
  providers: [
    // Global authentication (JWT) — opt out per route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC — enforced when @Roles() is present.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Global rate limiting.
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global validation: strips unknown props, transforms types, forbids extras.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },

    // Consistent success envelope + Decimal serialization.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    // Consistent error envelope + Prisma error mapping.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
