import { randomUUID } from 'node:crypto';
import { DEFAULT_SHOPPING_LIST_NAME, SESSION_COOKIE_NAME, type HouseholdRole } from '@homi/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../src/db';
import { hashPassword } from '../../src/lib/passwords';
import { TestClient } from './http';

/**
 * Database fixtures for integration tests. They write rows directly (bypassing the feature
 * routes) so every team can set up state independently of the auth/households modules.
 */

export const DEFAULT_TEST_PASSWORD = 'Testpasswort-123';

let cachedHash: Promise<string> | undefined;
function defaultPasswordHash(): Promise<string> {
  cachedHash ??= hashPassword(DEFAULT_TEST_PASSWORD);
  return cachedHash;
}

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  password: string;
}

export async function createUser(
  prisma: PrismaClient,
  overrides: { email?: string; displayName?: string; password?: string } = {},
): Promise<TestUser> {
  const password = overrides.password ?? DEFAULT_TEST_PASSWORD;
  const email = (overrides.email ?? `user-${randomUUID().slice(0, 8)}@example.ch`).toLowerCase();
  const user = await prisma.user.create({
    data: {
      email,
      displayName: overrides.displayName ?? 'Test Person',
      passwordHash: overrides.password ? await hashPassword(password) : await defaultPasswordHash(),
    },
    select: { id: true, email: true, displayName: true },
  });
  return { ...user, password };
}

/** Creates a user plus a session and returns a client that is logged in as that user. */
export async function createLoggedInUser(
  app: FastifyInstance,
  overrides: { email?: string; displayName?: string; password?: string } = {},
): Promise<{ user: TestUser; client: TestClient; token: string; sessionId: string }> {
  const user = await createUser(app.prisma, overrides);
  const { token, session } = await app.sessions.create(user.id, { userAgent: 'vitest' });
  const client = new TestClient(app).setCookie(SESSION_COOKIE_NAME, token);
  return { user, client, token, sessionId: session.id };
}

export interface TestHousehold {
  id: string;
  name: string;
  shoppingListId: string;
  conversationId: string;
}

/**
 * Creates a household the way §3 describes it: household, OWNER membership, default shopping list,
 * HOUSEHOLD conversation with the owner, and a HOUSEHOLD_CREATED activity.
 */
export async function createHousehold(prisma: PrismaClient, ownerId: string, name = 'Test-WG'): Promise<TestHousehold> {
  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({ data: { name, createdById: ownerId } });
    await tx.householdMember.create({ data: { householdId: household.id, userId: ownerId, role: 'OWNER' } });
    const list = await tx.shoppingList.create({
      data: { householdId: household.id, name: DEFAULT_SHOPPING_LIST_NAME },
    });
    const conversation = await tx.conversation.create({
      data: { householdId: household.id, type: 'HOUSEHOLD', members: { create: { userId: ownerId } } },
    });
    await tx.householdActivity.create({
      data: {
        householdId: household.id,
        actorId: ownerId,
        type: 'HOUSEHOLD_CREATED',
        entityType: 'household',
        entityId: household.id,
        meta: { name },
      },
    });
    return { id: household.id, name: household.name, shoppingListId: list.id, conversationId: conversation.id };
  });
}

/** Adds a member (and joins the household conversation), like accepting an invitation. */
export async function addMember(
  prisma: PrismaClient,
  household: Pick<TestHousehold, 'id' | 'conversationId'>,
  userId: string,
  role: HouseholdRole = 'MEMBER',
): Promise<void> {
  await prisma.$transaction([
    prisma.householdMember.create({ data: { householdId: household.id, userId, role } }),
    prisma.conversationMember.create({ data: { conversationId: household.conversationId, userId } }),
  ]);
}
