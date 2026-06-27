/* eslint-disable no-console */
// Production bootstrap: creates ONLY the initial admin account — no sample
// products, services or categories. Idempotent (safe to run more than once).
// Credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before bootstrapping the admin.',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      fullName: 'System Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`✓ Admin ready: ${admin.email}`);
  console.log('No sample data created (production bootstrap).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
