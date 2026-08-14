import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type CashClient = Prisma.TransactionClient | PrismaService;

/**
 * The shop runs a single shared till: at most one cash session is OPEN at a
 * time and every user posts to it, whoever opened it. Looking the session up
 * this way (rather than per user) means a shift left open by one cashier can't
 * quietly swallow another's takings, and nobody can start a rival session.
 */
export function findOpenSession(client: CashClient) {
  return client.cashSession.findFirst({
    where: { status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });
}

/** Same, but for money that must land in a till — `action` completes the
 * sentence "Open the till before …". */
export async function requireOpenSession(client: CashClient, action: string) {
  const session = await findOpenSession(client);
  if (!session) {
    throw new BadRequestException(
      `No open cash session. Open the till before ${action}.`,
    );
  }
  return session;
}
