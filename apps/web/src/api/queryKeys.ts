/**
 * TanStack Query keys (ARCHITECTURE §7). Always build keys through this module so realtime
 * invalidation (hooks/useRealtimeSync.ts) and feature code agree.
 *
 * Prefix keys (`itemsAll`, `itemAll`, `messagesAll`) match every query below them
 * (TanStack Query matches keys by prefix).
 */
export type ItemListKeyParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export const queryKeys = {
  me: ['me'] as const,
  household: (householdId: string) => ['household', householdId] as const,
  dashboard: (householdId: string) => ['dashboard', householdId] as const,
  itemsAll: (householdId: string) => ['items', householdId] as const,
  items: (householdId: string, params: ItemListKeyParams = {}) => ['items', householdId, params] as const,
  itemAll: (householdId: string) => ['item', householdId] as const,
  item: (householdId: string, itemId: string) => ['item', householdId, itemId] as const,
  shopping: (householdId: string) => ['shopping', householdId] as const,
  conversations: (householdId: string) => ['conversations', householdId] as const,
  messagesAll: (householdId: string) => ['messages', householdId] as const,
  messages: (householdId: string, conversationId: string) => ['messages', householdId, conversationId] as const,
  invitations: (householdId: string) => ['invitations', householdId] as const,
} as const;

/** First segments of all household-scoped keys (`[scope, householdId, …]`). */
export const HOUSEHOLD_SCOPED_KEY_ROOTS = [
  'household',
  'dashboard',
  'items',
  'item',
  'shopping',
  'conversations',
  'messages',
  'invitations',
] as const;

export type HouseholdScopedKeyRoot = (typeof HOUSEHOLD_SCOPED_KEY_ROOTS)[number];

/** `true` for keys shaped `[<household-scoped root>, householdId, …]` (optionally for one household). */
export function isHouseholdScopedKey(queryKey: readonly unknown[], householdId?: string): boolean {
  const [root, hid] = queryKey;
  if (typeof root !== 'string' || typeof hid !== 'string') return false;
  if (!(HOUSEHOLD_SCOPED_KEY_ROOTS as readonly string[]).includes(root)) return false;
  return householdId === undefined || hid === householdId;
}
