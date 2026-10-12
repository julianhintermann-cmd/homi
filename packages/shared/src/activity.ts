import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, MoneyStringSchema, UserRefSchema } from './common';
import { ActivityEntityTypeSchema, ActivityTypeSchema, HouseholdRoleSchema } from './enums';

/*
 * Household activity feed (Home "Letzte Aktivitäten" + weekly value trend).
 */

/** Known keys of `HouseholdActivity.meta`; unknown keys are preserved. */
export const ActivityMetaSchema = z
  .object({
    /** Name of the affected item / shopping item / household. */
    name: z.string().optional(),
    /** Display name of the affected member. */
    displayName: z.string().optional(),
    role: HouseholdRoleSchema.optional(),
    /** Number of affected entities (bulk operations). */
    count: z.number().optional(),
    quantityBefore: z.string().optional(),
    quantityAfter: z.string().optional(),
    delta: z.string().optional(),
  })
  .loose();
export type ActivityMeta = z.infer<typeof ActivityMetaSchema>;

export const ActivityDtoSchema = z.object({
  id: IdSchema,
  type: ActivityTypeSchema,
  actor: UserRefSchema.nullable(),
  entityType: ActivityEntityTypeSchema.nullable(),
  entityId: IdSchema.nullable(),
  meta: ActivityMetaSchema.nullable(),
  /** Change of the total inventory value caused by this activity (CHF), if any. */
  valueDelta: MoneyStringSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type ActivityDto = z.infer<typeof ActivityDtoSchema>;
