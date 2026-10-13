import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  ClearCompletedRequestSchema,
  CreateShoppingItemRequestSchema,
  IdSchema,
  UpdateShoppingItemRequestSchema,
  type ClearCompletedResponse,
  type ShoppingItemDto,
  type ShoppingListResponse,
  type SyncAction,
} from '@homi/shared';
import { AppError } from '../../lib/http-errors';
import type { KeyedRateLimiter } from '../../lib/rate-limit';
import { requireMember } from '../../plugins/auth';
import {
  clearCompletedShoppingItems,
  createShoppingItem,
  deleteShoppingItem,
  getShoppingList,
  updateShoppingItem,
} from './service';

/**
 * Shopping (§5): /households/:householdId/shopping(/items(/:shoppingItemId)|/clear-completed).
 *
 * Registered by app.ts under the `/api` prefix. Every route checks the membership first (non-members
 * get 404 before any validation happens), validates with the `@homi/shared` schemas and emits the
 * `shopping` + `dashboard` sync events only after the transaction committed. Mutations are
 * rate-limited per user: each one writes an activity and makes every member's client refetch.
 */

/**
 * Shopping writes per user. Generous for real use (rapid entry, ticking off while shopping: a few
 * per second at most), but stops a script from flooding the activity log and the members' sockets.
 */
export const SHOPPING_WRITE_LIMIT = { max: 60, windowMs: 10_000 } as const;

interface HouseholdParams {
  householdId: string;
}

interface ItemParams extends HouseholdParams {
  shoppingItemId: string;
}

/** Malformed item ids are answered like unknown ones (404), never with a validation error. */
function parseItemId(raw: string): string {
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('NOT_FOUND');
  return parsed.data.toLowerCase();
}

/**
 * The member's household id in its canonical (lower-case) form. UUIDs match case-insensitively in
 * the URL and in PostgreSQL, but socket rooms are keyed by the canonical id – `/households/<UPPER>/…`
 * must still reach the other members live.
 */
async function requireShoppingMember(request: FastifyRequest, rawHouseholdId: string) {
  const member = await requireMember(request, rawHouseholdId);
  return { ...member, householdId: member.householdId.toLowerCase() };
}

function consumeWrite(limiter: KeyedRateLimiter, reply: FastifyReply, userId: string): void {
  const key = `shopping:${userId}`;
  if (limiter.consume(key)) return;
  const retryAfterSeconds = Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1000));
  reply.header('retry-after', String(retryAfterSeconds));
  throw new AppError('RATE_LIMITED', 'Zu viele Änderungen in kurzer Zeit. Bitte warte einen Moment.', {
    details: { retryAfterSeconds },
  });
}

function emitShoppingSync(
  app: FastifyInstance,
  householdId: string,
  actorId: string,
  action: SyncAction,
  entityId?: string,
): void {
  const base = { householdId, actorId, action, ...(entityId ? { entityId } : {}) };
  app.realtime.emitSync({ ...base, scope: 'shopping' });
  app.realtime.emitSync({ ...base, scope: 'dashboard' });
}

export const shoppingRoutes: FastifyPluginAsync = async (app) => {
  const writes = app.createKeyedRateLimiter(SHOPPING_WRITE_LIMIT);

  app.get<{ Params: HouseholdParams }>(
    '/households/:householdId/shopping',
    async (request): Promise<ShoppingListResponse> => {
      const { householdId } = await requireShoppingMember(request, request.params.householdId);
      return getShoppingList(app.prisma, householdId);
    },
  );

  app.post<{ Params: HouseholdParams }>('/households/:householdId/shopping/items', async (request, reply) => {
    const { householdId, user } = await requireShoppingMember(request, request.params.householdId);
    consumeWrite(writes, reply, user.id);
    const input = CreateShoppingItemRequestSchema.parse(request.body ?? {});
    const result = await createShoppingItem(app.prisma, { householdId, userId: user.id }, input);
    if (result.created) emitShoppingSync(app, householdId, user.id, 'created', result.item.id);
    return reply.code(result.created ? 201 : 200).send(result.item satisfies ShoppingItemDto);
  });

  app.patch<{ Params: ItemParams }>(
    '/households/:householdId/shopping/items/:shoppingItemId',
    async (request, reply): Promise<ShoppingItemDto> => {
      const { householdId, user } = await requireShoppingMember(request, request.params.householdId);
      const itemId = parseItemId(request.params.shoppingItemId);
      consumeWrite(writes, reply, user.id);
      const input = UpdateShoppingItemRequestSchema.parse(request.body ?? {});
      const result = await updateShoppingItem(app.prisma, { householdId, userId: user.id }, itemId, input);
      if (result.changed) emitShoppingSync(app, householdId, user.id, 'updated', itemId);
      return result.item;
    },
  );

  app.delete<{ Params: ItemParams }>(
    '/households/:householdId/shopping/items/:shoppingItemId',
    async (request, reply) => {
      const { householdId, user } = await requireShoppingMember(request, request.params.householdId);
      const itemId = parseItemId(request.params.shoppingItemId);
      consumeWrite(writes, reply, user.id);
      await deleteShoppingItem(app.prisma, { householdId, userId: user.id }, itemId);
      emitShoppingSync(app, householdId, user.id, 'deleted', itemId);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: HouseholdParams }>(
    '/households/:householdId/shopping/clear-completed',
    async (request, reply): Promise<ClearCompletedResponse> => {
      const { householdId, user } = await requireShoppingMember(request, request.params.householdId);
      consumeWrite(writes, reply, user.id);
      const { itemIds } = ClearCompletedRequestSchema.parse(request.body ?? {});
      const deleted = await clearCompletedShoppingItems(
        app.prisma,
        { householdId, userId: user.id },
        itemIds?.map((id) => id.toLowerCase()),
      );
      if (deleted > 0) emitShoppingSync(app, householdId, user.id, 'bulk');
      return { deleted };
    },
  );
};
