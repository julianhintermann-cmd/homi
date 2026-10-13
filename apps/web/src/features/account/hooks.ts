import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordRequest, MeResponse } from '@homi/shared';
import { changePassword, updateProfile } from '@/api/account';
import { queryKeys } from '@/api/queryKeys';

/** `PATCH /api/account` – the answer is the fresh `MeResponse`, written straight into `['me']`. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => updateProfile({ displayName }),
    onSuccess: (me) => {
      client.setQueryData<MeResponse | null>(queryKeys.me, me);
    },
  });
}

/** `POST /api/account/password` – the server keeps this session and signs out all others. */
export function useChangePassword() {
  return useMutation({ mutationFn: (body: ChangePasswordRequest) => changePassword(body) });
}
