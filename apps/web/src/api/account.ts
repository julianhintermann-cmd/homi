import type { ChangePasswordRequest, MeResponse, SetActiveHouseholdRequest, UpdateProfileRequest } from '@homi/shared';
import { api } from './client';

/** Persists `User.lastHouseholdId` (membership-checked by the server). */
export function setActiveHousehold(householdId: string): Promise<void> {
  const body: SetActiveHouseholdRequest = { householdId };
  return api.put<void>('/api/account/active-household', body);
}

export function updateProfile(body: UpdateProfileRequest): Promise<MeResponse> {
  return api.patch<MeResponse>('/api/account', body);
}

/** Revokes all other sessions on success. */
export function changePassword(body: ChangePasswordRequest): Promise<void> {
  return api.post<void>('/api/account/password', body);
}
