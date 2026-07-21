import { execSync } from 'child_process';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { BackupService } from '../../src/modules/backup/backup.service';

/**
 * Backup + restore against a REAL Postgres. The case that matters: a restore
 * commits, and then the bookkeeping that follows it fails because the restored
 * database has a different users table than the signed-in session was issued
 * against. That must not be reported to the admin as a failed restore.
 *
 * Gated on TEST_DATABASE_URL (the database is migrated and replaced here):
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/kj_test npm run test:int
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

describeDb('Backup & restore (integration)', () => {
  let prisma: PrismaService;
  let backup: BackupService;
  let audit: AuditService;
  let dumpPath: string;
  let originalUserId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DB },
      stdio: 'ignore',
    });

    prisma = new PrismaService();
    await prisma.$connect();
    audit = new AuditService(prisma);
    backup = new BackupService(prisma);

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE audit_logs, users RESTART IDENTITY CASCADE;
    `);

    const user = await prisma.user.create({
      data: {
        email: `backup_${Date.now()}@test.local`,
        passwordHash: 'x',
        fullName: 'Backup Tester',
        role: 'ADMIN',
      },
    });
    originalUserId = user.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('produces a dump that pg_restore can read', async () => {
    const result = await backup.createDump();
    dumpPath = result.path;
    expect(result.filename).toMatch(/^kj_\d+\.dump$/);
  });

  it('restores it, and the app can query straight afterwards', async () => {
    // The user recorded below does not exist in the dump, so restoring drops it.
    const ghost = await prisma.user.create({
      data: {
        email: `ghost_${Date.now()}@test.local`,
        passwordHash: 'x',
        fullName: 'Created After Backup',
        role: 'ADMIN',
      },
    });

    await backup.restoreDump(dumpPath);

    // Restore disconnects the pool and reconnects; a query must work right away
    // rather than failing on a cached plan bound to the dropped tables.
    const users = await prisma.user.findMany({ select: { id: true } });
    expect(users.map((u) => u.id)).toEqual([originalUserId]);
    expect(users.map((u) => u.id)).not.toContain(ghost.id);
  });

  it('the audit row for a user missing from the backup is what used to fail', async () => {
    // This is the exact write the restore endpoint performs afterwards. It
    // still throws — the fix is that the endpoint no longer lets it surface as
    // a failed restore.
    await expect(
      audit.record({
        userId: '00000000-0000-0000-0000-000000000000',
        action: 'DB_RESTORED',
        entityType: 'Database',
        entityId: 'some.dump',
      }),
    ).rejects.toThrow();

    // …while the restored data is fully intact behind it.
    const count = await prisma.user.count();
    expect(count).toBe(1);
  });

  it('restores a backup taken before a later migration added a foreign key', async () => {
    // Reproduces the real failure: a dump taken before accounting_periods
    // existed, restored into a database that now has it. pg_restore --clean
    // never drops that table (it is not in the dump), so its foreign key onto
    // users blocks "ALTER TABLE users DROP CONSTRAINT users_pkey".
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS added_after_backup (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES users(id)
      );
    `);
    await prisma.$executeRawUnsafe(
      `INSERT INTO added_after_backup ("userId") VALUES ('${originalUserId}');`,
    );

    await backup.restoreDump(dumpPath);

    // The table that post-dated the backup is gone, and the data is restored.
    const leftover = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'added_after_backup'
       ) AS exists;`,
    );
    expect(leftover[0].exists).toBe(false);
    expect(await prisma.user.count()).toBe(1);
  });

  it('leaves the database untouched when the file is not a real dump', async () => {
    const before = await prisma.user.count();
    await expect(backup.restoreDump(__filename)).rejects.toThrow(/not a valid KJ backup/i);
    expect(await prisma.user.count()).toBe(before);
  });

  it('refuses a backup that predates the current schema unless acknowledged', async () => {
    // Build a genuinely older backup: roll the newest migration back in full —
    // its table *and* its history row — then dump. That is exactly the shape of
    // the file that took login down, a schema behind the running Prisma client.
    // Reverse it completely — table and enum type. A backup taken before the
    // migration would contain neither; leaving the type behind would be a state
    // that never occurs in practice.
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS accounting_periods CASCADE;`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "PeriodStatus";`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations WHERE migration_name LIKE '%_accounting_periods';`,
    );
    const behind = await backup.createDump();

    const inspection = await backup.inspectDump(behind.path);
    expect(inspection.isBehind).toBe(true);
    expect(inspection.missingMigrations).toContain('20260721103000_accounting_periods');

    // Refused by default — this is the protection that was missing.
    await expect(backup.restoreDump(behind.path)).rejects.toThrow(
      /taken before .* database change/i,
    );

    // Acknowledged, it proceeds and re-applies what the backup predates, so the
    // schema matches the running code instead of breaking every query.
    const result = await backup.restoreDump(behind.path, true);
    expect(result.migrationError).toBeUndefined();

    const restored = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('public.accounting_periods') IS NOT NULL AS exists;`,
    );
    expect(restored[0].exists).toBe(true);
    expect(await prisma.accountingPeriod.count()).toBe(0);
  });

  it('records the audit row when the signed-in user does exist in the backup', async () => {
    await audit.record({
      userId: originalUserId,
      action: 'DB_RESTORED',
      entityType: 'Database',
      entityId: 'some.dump',
    });
    const logged = await prisma.auditLog.findFirst({ where: { action: 'DB_RESTORED' } });
    expect(logged?.userId).toBe(originalUserId);
  });
});
