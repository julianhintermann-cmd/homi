/**
 * Session transitions used by the auth/account screens.
 *
 * The implementation lives in `hooks/useAuth.ts` (one place for the whole app – the welcome screen
 * logs out through it too): the cache is reset race-free and **without** `queryClient.clear()`, which
 * would detach the route guards and `AppRuntime` from the `['me']` query (no redirect after
 * login/logout, no socket (re)connect).
 */
export {
  endSession,
  replaceSession,
  resetSessionAfterPasswordReset,
  useLogin as useLoginMutation,
  useLogout as useLogoutMutation,
  useRegister as useRegisterMutation,
} from '@/hooks/useAuth';
