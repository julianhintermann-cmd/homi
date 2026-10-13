import type {
  AcceptInvitationResponse,
  ChangeMemberRoleRequest,
  CreatedInvitation,
  CreateHouseholdRequest,
  CreateInvitationRequest,
  HouseholdDetail,
  HouseholdListResponse,
  HouseholdRole,
  InvitationListResponse,
  InvitationPreview,
  MemberDto,
  RenameHouseholdRequest,
} from '@homi/shared';
import { api } from './client';

/*
 * Households, members and invitations (ARCHITECTURE §5). Household-scoped paths are built with
 * encoded ids; the server answers 404 for anything the user is not a member of.
 */

const householdPath = (householdId: string) => `/api/households/${encodeURIComponent(householdId)}`;

export function fetchHouseholds(signal?: AbortSignal): Promise<HouseholdListResponse> {
  return api.get<HouseholdListResponse>('/api/households', { signal });
}

export function createHousehold(body: CreateHouseholdRequest): Promise<HouseholdDetail> {
  return api.post<HouseholdDetail>('/api/households', body);
}

export function fetchHousehold(householdId: string, signal?: AbortSignal): Promise<HouseholdDetail> {
  return api.get<HouseholdDetail>(householdPath(householdId), { signal });
}

export function renameHousehold(householdId: string, body: RenameHouseholdRequest): Promise<HouseholdDetail> {
  return api.patch<HouseholdDetail>(householdPath(householdId), body);
}

/** OWNER only; removes everything of the household. */
export function deleteHousehold(householdId: string): Promise<void> {
  return api.delete(householdPath(householdId));
}

export function changeMemberRole(householdId: string, userId: string, role: HouseholdRole): Promise<MemberDto> {
  const body: ChangeMemberRoleRequest = { role };
  return api.patch<MemberDto>(`${householdPath(householdId)}/members/${encodeURIComponent(userId)}`, body);
}

/** Removes a member – or leaves the household when `userId` is the current user. */
export function removeMember(householdId: string, userId: string): Promise<void> {
  return api.delete(`${householdPath(householdId)}/members/${encodeURIComponent(userId)}`);
}

export function fetchInvitations(householdId: string, signal?: AbortSignal): Promise<InvitationListResponse> {
  return api.get<InvitationListResponse>(`${householdPath(householdId)}/invitations`, { signal });
}

/** The returned `url` contains the raw token – it is shown once and never stored client-side. */
export function createInvitation(householdId: string, body: CreateInvitationRequest): Promise<CreatedInvitation> {
  return api.post<CreatedInvitation>(`${householdPath(householdId)}/invitations`, body);
}

export function revokeInvitation(householdId: string, invitationId: string): Promise<void> {
  return api.delete(`${householdPath(householdId)}/invitations/${encodeURIComponent(invitationId)}`);
}

/** Public preview; works without a session (401 must not trigger the logout handler). */
export function fetchInvitationPreview(token: string, signal?: AbortSignal): Promise<InvitationPreview> {
  return api.get<InvitationPreview>(`/api/invitations/${encodeURIComponent(token)}`, {
    signal,
    skipUnauthorizedHandler: true,
  });
}

export function acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
  return api.post<AcceptInvitationResponse>(`/api/invitations/${encodeURIComponent(token)}/accept`);
}

/**
 * Get-or-create the direct chat with a member (endpoint of the chat module, §5 Chat) – used by
 * "Nachricht senden" on the member screen.
 */
export { openDirectConversation } from './chat';
