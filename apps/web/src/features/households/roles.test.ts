import { describe, expect, it } from 'vitest';
import type { HouseholdRole, MemberDto } from '@homi/shared';
import { invitationCreatedLabel, invitationStateFromError, invitationTokenFromInput } from './invitationLink';
import { ApiError } from '@/api/client';
import {
  householdPermissions,
  itemCountLabel,
  memberActions,
  memberCountLabel,
  roleLabel,
  sortMembersSelfFirst,
} from './roles';

const member = (userId: string, role: HouseholdRole): MemberDto => ({
  userId,
  displayName: userId,
  role,
  joinedAt: '2026-10-01T08:00:00.000Z',
});

describe('role labels', () => {
  it('maps the three roles to the documented wording', () => {
    expect(roleLabel('OWNER')).toBe('Inhaber:in');
    expect(roleLabel('ADMIN')).toBe('Verwaltung');
    expect(roleLabel('MEMBER')).toBe('Mitglied');
  });

  it('counts members and items in German', () => {
    expect(memberCountLabel(1)).toBe('1 Mitglied');
    expect(memberCountLabel(3)).toBe('3 Mitglieder');
    expect(itemCountLabel(1)).toBe('1 Artikel');
    expect(itemCountLabel(128)).toBe('128 Artikel');
  });

  it('lists the current user first', () => {
    const members = [member('a', 'MEMBER'), member('me', 'OWNER'), member('b', 'ADMIN')];
    expect(sortMembersSelfFirst(members, 'me').map((m) => m.userId)).toEqual(['me', 'a', 'b']);
  });
});

describe('permissions (mirror of the server rules)', () => {
  const members = [member('owner', 'OWNER'), member('admin', 'ADMIN'), member('m1', 'MEMBER'), member('m2', 'MEMBER')];

  it('household-level permissions per role', () => {
    expect(householdPermissions({ myRole: 'OWNER', members })).toEqual({
      canRename: true,
      canInvite: true,
      canDelete: true,
      canChangeRoles: true,
      isLastOwner: true,
      canLeave: false,
    });
    expect(householdPermissions({ myRole: 'ADMIN', members })).toMatchObject({
      canRename: true,
      canInvite: true,
      canDelete: false,
      canChangeRoles: false,
      canLeave: true,
    });
    expect(householdPermissions({ myRole: 'MEMBER', members })).toMatchObject({
      canRename: false,
      canInvite: false,
      canDelete: false,
      canLeave: true,
    });
    const twoOwners = [...members, member('owner2', 'OWNER')];
    expect(householdPermissions({ myRole: 'OWNER', members: twoOwners })).toMatchObject({
      isLastOwner: false,
      canLeave: true,
    });
  });

  it('member actions: OWNER', () => {
    const detail = { myRole: 'OWNER' as const, members };
    expect(memberActions(detail, 'owner', member('admin', 'ADMIN'))).toMatchObject({
      canRemove: true,
      roleOptions: ['OWNER', 'MEMBER'],
    });
    // The last OWNER can neither leave nor step down …
    expect(memberActions(detail, 'owner', member('owner', 'OWNER'))).toEqual({
      isSelf: true,
      canRemove: false,
      roleOptions: [],
      blockedByLastOwner: true,
    });
    // … unless a second OWNER exists.
    const withSecondOwner = { myRole: 'OWNER' as const, members: [...members, member('owner2', 'OWNER')] };
    expect(memberActions(withSecondOwner, 'owner', member('owner', 'OWNER'))).toMatchObject({
      canRemove: true,
      roleOptions: ['ADMIN', 'MEMBER'],
      blockedByLastOwner: false,
    });
  });

  it('member actions: ADMIN removes MEMBERs only and never changes roles', () => {
    const detail = { myRole: 'ADMIN' as const, members };
    expect(memberActions(detail, 'admin', member('m1', 'MEMBER'))).toMatchObject({ canRemove: true, roleOptions: [] });
    expect(memberActions(detail, 'admin', member('owner', 'OWNER'))).toMatchObject({ canRemove: false });
    expect(memberActions(detail, 'admin', member('admin2', 'ADMIN'))).toMatchObject({ canRemove: false });
    expect(memberActions(detail, 'admin', member('admin', 'ADMIN'))).toMatchObject({ isSelf: true, canRemove: true });
  });

  it('member actions: MEMBER may only leave', () => {
    const detail = { myRole: 'MEMBER' as const, members };
    expect(memberActions(detail, 'm1', member('m2', 'MEMBER'))).toMatchObject({ canRemove: false, roleOptions: [] });
    expect(memberActions(detail, 'm1', member('m1', 'MEMBER'))).toMatchObject({ canRemove: true, roleOptions: [] });
  });
});

describe('invitation links', () => {
  const token = 'Abc_def-1234567890123456789012345678901234';

  it('extracts the token from links, paths and bare tokens', () => {
    expect(invitationTokenFromInput(`https://homi.example.ch/einladung/${token}`)).toBe(token);
    expect(invitationTokenFromInput(`  /einladung/${token}?x=1 `)).toBe(token);
    expect(invitationTokenFromInput(token)).toBe(token);
    expect(invitationTokenFromInput('https://evil.example/login')).toBeNull();
    expect(invitationTokenFromInput('/einladung/kurz')).toBeNull();
    expect(invitationTokenFromInput('')).toBeNull();
  });

  it('maps accept errors to view states', () => {
    const gone = (status: string) =>
      new ApiError({ status: 410, code: 'INVITATION_INVALID', message: 'x', details: { status } });
    expect(invitationStateFromError(gone('used'))).toBe('used');
    expect(invitationStateFromError(gone('expired'))).toBe('expired');
    expect(invitationStateFromError(gone('revoked'))).toBe('revoked');
    expect(invitationStateFromError(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'x' }))).toBe('invalid');
    expect(invitationStateFromError(new ApiError({ status: 500, code: 'INTERNAL', message: 'x' }))).toBeNull();
    expect(invitationStateFromError(new Error('x'))).toBeNull();
  });

  // Regression (review r2): active links with the same role and expiry were indistinguishable.
  it('labels active invitations with creator and creation time', () => {
    const options = { timeZone: 'Europe/Zurich', now: new Date('2026-10-13T10:00:00.000Z') };
    const by = { id: 'u1', displayName: 'Julian' };
    expect(invitationCreatedLabel({ createdAt: '2026-10-12T23:23:00.000Z', createdBy: by }, options)).toBe(
      'Erstellt von Julian · heute, 01:23',
    );
    expect(invitationCreatedLabel({ createdAt: '2026-10-12T16:05:00.000Z', createdBy: by }, options)).toBe(
      'Erstellt von Julian · gestern, 18:05',
    );
    expect(invitationCreatedLabel({ createdAt: '2026-10-01T16:05:00.000Z', createdBy: null }, options)).toBe(
      'Erstellt 01.10.2026, 18:05',
    );
  });
});
