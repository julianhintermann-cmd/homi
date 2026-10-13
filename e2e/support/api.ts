import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext, APIResponse, PlaywrightWorkerArgs } from '@playwright/test';
import { BASE_URL, PRODUCT_IMAGE_DIR, TEST_PASSWORD } from './env';

/** CSRF header every mutation under /api must carry (docs/ARCHITECTURE.md §4.3). */
export const CSRF_HEADERS = { 'X-Homi-Request': '1' } as const;

/** A unique-enough suffix for e-mail addresses and names (no coordination between workers needed). */
export function uniqueId(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

/**
 * A random private address for `X-Forwarded-For`. The E2E server runs with TRUST_PROXY=true, so the per-IP rate
 * limits (register 5/min, login 10/min) are applied per simulated person instead of per test machine.
 */
export function randomClientIp(): string {
  const [a = 1, b = 1, c = 1] = randomBytes(3);
  return `10.${a}.${b}.${(c % 253) + 1}`;
}

export function uniqueEmail(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueId()}@homi.test`;
}

type Playwright = PlaywrightWorkerArgs['playwright'];

/** Response bodies are only inspected by the specs; they are not typed here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  headers: Record<string, string>;
}

async function toResult<T>(response: APIResponse): Promise<ApiResult<T>> {
  const bytes = await response.body();
  const text = bytes.toString('utf8');
  let body: unknown = bytes;
  const type = response.headers()['content-type'] ?? '';
  if (type.includes('json')) {
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
  } else if (type.startsWith('text/')) {
    body = text;
  }
  return { status: response.status(), ok: response.ok(), body: body as T, headers: response.headers() };
}

/** Thin JSON client around an {@link APIRequestContext} (keeps the session cookie) that adds the CSRF header. */
export class ApiClient {
  constructor(readonly request: APIRequestContext) {}

  get<T = Json>(url: string, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
    return this.request.get(url, { headers }).then((r) => toResult<T>(r));
  }
  post<T = Json>(url: string, data?: unknown, headers: Record<string, string> = CSRF_HEADERS): Promise<ApiResult<T>> {
    return this.request.post(url, { headers, data }).then((r) => toResult<T>(r));
  }
  put<T = Json>(url: string, data?: unknown, headers: Record<string, string> = CSRF_HEADERS): Promise<ApiResult<T>> {
    return this.request.put(url, { headers, data }).then((r) => toResult<T>(r));
  }
  patch<T = Json>(url: string, data?: unknown, headers: Record<string, string> = CSRF_HEADERS): Promise<ApiResult<T>> {
    return this.request.patch(url, { headers, data }).then((r) => toResult<T>(r));
  }
  delete<T = Json>(url: string, headers: Record<string, string> = CSRF_HEADERS): Promise<ApiResult<T>> {
    return this.request.delete(url, { headers }).then((r) => toResult<T>(r));
  }

  /** Any method with the same conventions as the helpers above (CSRF header unless `headers` is given). */
  send<T = Json>(
    method: HttpMethod,
    url: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<ApiResult<T>> {
    if (method === 'get') return this.get<T>(url, headers);
    if (method === 'delete') return this.delete<T>(url, headers);
    return this[method]<T>(url, data, headers);
  }

  /** Uploads a design product photo through the real image pipeline. */
  async uploadImage(
    householdId: string,
    fileName: string,
  ): Promise<ApiResult<{ id: string; thumbUrl: string; fullUrl: string }>> {
    const buffer = await readFile(path.join(PRODUCT_IMAGE_DIR, fileName));
    const response = await this.request.post(`/api/households/${householdId}/images`, {
      headers: CSRF_HEADERS,
      multipart: { file: { name: fileName, mimeType: 'image/png', buffer } },
    });
    return toResult(response);
  }
}

export interface ApiPerson {
  displayName: string;
  email: string;
  password: string;
  ip: string;
  userId: string;
  /** Raw value of the `homi_session` cookie. */
  sessionCookie: string;
  api: ApiClient;
  dispose: () => Promise<void>;
}

/** Registers a person through the real API in an isolated request context (own cookie jar, own client IP). */
export async function registerApiPerson(playwright: Playwright, displayName: string): Promise<ApiPerson> {
  const ip = randomClientIp();
  const request = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'X-Forwarded-For': ip },
  });
  const api = new ApiClient(request);
  const email = uniqueEmail(displayName);
  const registered = await api.post<{ user: { id: string } }>('/api/auth/register', {
    displayName,
    email,
    password: TEST_PASSWORD,
  });
  if (registered.status !== 201) {
    throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.body)}`);
  }
  const state = await request.storageState();
  const cookie = state.cookies.find((c) => c.name === 'homi_session');
  if (!cookie) throw new Error('no homi_session cookie after register');
  return {
    displayName,
    email,
    password: TEST_PASSWORD,
    ip,
    userId: registered.body.user.id,
    sessionCookie: cookie.value,
    api,
    dispose: () => request.dispose(),
  };
}
