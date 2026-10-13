import { z } from 'zod';
import {
  ACTIVITY_ENTITY_TYPE_VALUES,
  ACTIVITY_TYPE_VALUES,
  CONVERSATION_TYPE_VALUES,
  HOUSEHOLD_ROLE_VALUES,
  ITEM_CATEGORY_VALUES,
  MESSAGE_KIND_VALUES,
  UNIT_VALUES,
} from './enum-values';

/*
 * Zod schemas of the enums (§3). Values, value objects, union types and German labels are in the
 * zod-free `enum-values.ts` (re-exported here, so `@homi/shared` keeps its public API).
 */

export * from './enum-values';

export const HouseholdRoleSchema = z.enum(HOUSEHOLD_ROLE_VALUES);
export const ItemCategorySchema = z.enum(ITEM_CATEGORY_VALUES);
export const UnitSchema = z.enum(UNIT_VALUES);
export const ConversationTypeSchema = z.enum(CONVERSATION_TYPE_VALUES);
export const MessageKindSchema = z.enum(MESSAGE_KIND_VALUES);
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPE_VALUES);
export const ActivityEntityTypeSchema = z.enum(ACTIVITY_ENTITY_TYPE_VALUES);
