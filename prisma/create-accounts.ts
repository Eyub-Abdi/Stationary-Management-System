/* eslint-disable no-console */
// One-off script: create/refresh an ADMIN and a STAFF account with simple
// emails and the password "myungsoon". Run with: npm run accounts
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PASSWORD = 'myungsoon';

const accounts = [
  { email: 'admin@kj.com', fullName: 'Admin User', role: Role.ADMIN },
  { email: 'staff@kj.com', fullName: 'Staff User', role: Role.STAFF },
];

async function main() {
  for (const acc of accounts) {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      // Reset password + reactivate if the account already exists.
      update: { passwordHash, isActive: true, role: acc.role, fullName: acc.fullName },
      create: {
        email: acc.email,
        passwordHash,
        fullName: acc.fullName,
        role: acc.role,
        isActive: true,
      },
    });
    console.log(`✓ ${user.role.padEnd(5)} ready: ${user.email}  (password: ${PASSWORD})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
