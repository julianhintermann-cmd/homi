import type {
  AuthConfigResponse,
  LoginRequest,
  MeResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterRequest,
} from '@homi/shared';
import { api, isApiError } from './client';

/** Current session, or `null` when not logged in (401 is an expected answer here). */
export async function fetchMe(signal?: AbortSignal): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>('/api/auth/me', { signal, skipUnauthorizedHandler: true });
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

export function login(body: LoginRequest): Promise<MeResponse> {
  return api.post<MeResponse>('/api/auth/login', body, { skipUnauthorizedHandler: true });
}

export function register(body: RegisterRequest): Promise<MeResponse> {
  return api.post<MeResponse>('/api/auth/register', body, { skipUnauthorizedHandler: true });
}

export function logout(): Promise<void> {
  return api.post<void>('/api/auth/logout', undefined, { skipUnauthorizedHandler: true });
}

export function fetchAuthConfig(signal?: AbortSignal): Promise<AuthConfigResponse> {
  return api.get<AuthConfigResponse>('/api/auth/config', { signal });
}

/** Always answers 202 (no account enumeration). */
export function requestPasswordReset(body: PasswordResetRequest): Promise<void> {
  return api.post<void>('/api/auth/password-reset/request', body, { skipUnauthorizedHandler: true });
}

export function confirmPasswordReset(body: PasswordResetConfirmRequest): Promise<void> {
  return api.post<void>('/api/auth/password-reset/confirm', body, { skipUnauthorizedHandler: true });
}
