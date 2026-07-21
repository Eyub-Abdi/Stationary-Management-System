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
