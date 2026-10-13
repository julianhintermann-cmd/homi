import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@homi/shared/core';
import { connectivity } from '@/lib/connectivity';

/**
 * Typed HTTP client for the Homi API (same origin, cookie session).
 *
 * - `credentials: 'same-origin'`; no tokens are ever stored client-side.
 * - Mutations (anything but GET/HEAD/OPTIONS) send `X-Homi-Request: 1` (CSRF, ARCHITECTURE §4.3).
 * - Error responses `{ error: { code, message, details? } }` become `ApiError`.
 * - Network failures become `ApiError { status: 0, code: 'NETWORK_ERROR' }` and mark the
 *   server as unreachable (offline banner); any HTTP response marks it reachable again.
 * - A 401 calls the registered unauthorized handler (→ invalidates `['me']`, guards redirect to /login).
 */

/** CSRF header (§4.3) – from the zod-free `@homi/shared/core`, so the entry chunk stays zod-free. */
export const CSRF_HEADER = CSRF_HEADER_NAME;
export { CSRF_HEADER_VALUE };
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor({ status, code, message, details }: ApiErrorInit) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The request never reached the server (offline, DNS, connection reset, …). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Default German messages when the server sent no usable error body. */
const FALLBACK_MESSAGES: Readonly<Record<number, { code: string; message: string }>> = {
  400: { code: 'BAD_REQUEST', message: 'Die Anfrage ist ungültig.' },
  401: { code: 'UNAUTHORIZED', message: 'Bitte melde dich erneut an.' },
  403: { code: 'FORBIDDEN', message: 'Dafür fehlt dir die Berechtigung.' },
  404: { code: 'NOT_FOUND', message: 'Nicht gefunden.' },
  409: { code: 'CONFLICT', message: 'Die Daten wurden inzwischen geändert. Bitte lade neu.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Die Datei ist zu gross.' },
  429: { code: 'RATE_LIMITED', message: 'Zu viele Anfragen. Bitte warte einen Moment.' },
};

const SERVER_ERROR = {
  code: 'SERVER_ERROR',
  message: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.',
};
const REQUEST_FAILED = { code: 'REQUEST_FAILED', message: 'Die Anfrage konnte nicht ausgeführt werden.' };
const NETWORK_ERROR_MESSAGE = 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.';

/** Gateway errors mean the Homi server itself is not reachable. */
const UNREACHABLE_STATUSES = new Set([502, 504]);

export function networkError(cause?: unknown): ApiError {
  const error = new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message: NETWORK_ERROR_MESSAGE });
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause });
  return error;
}

/** Maps a non-2xx status and its (possibly empty / non-JSON) body to an `ApiError`. */
export function toApiError(status: number, body: unknown): ApiError {
  const fallback = FALLBACK_MESSAGES[status] ?? (status >= 500 ? SERVER_ERROR : REQUEST_FAILED);
  if (body && typeof body === 'object' && 'error' in body) {
    const raw = (body as { error: unknown }).error;
    if (raw && typeof raw === 'object') {
      const { code, message, details } = raw as Record<string, unknown>;
      return new ApiError({
        status,
        code: typeof code === 'string' && code ? code : fallback.code,
        message: typeof message === 'string' && message ? message : fallback.message,
        details,
      });
    }
  }
  return new ApiError({ status, code: fallback.code, message: fallback.message });
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registers what happens on a 401 (wired to the query client in lib/queryClient.ts). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: HttpMethod;
  /** JSON-serialisable body, or `FormData` for multipart uploads. */
  body?: unknown;
  query?: QueryParams;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  /** Do not trigger the global 401 handler (used by `/auth/me`, login, register). */
  skipUnauthorizedHandler?: boolean;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = path.startsWith('/') ? path : `/${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values: readonly QueryValue[] = Array.isArray(value) ? value : [value as QueryValue];
    for (const item of values) {
      if (item === undefined || item === null || item === '') continue;
      params.append(key, String(item));
    }
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

function buildHeaders(method: string, extra: RequestOptions['headers'], hasJsonBody: boolean): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (hasJsonBody) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.has(method)) headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return headers;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function handleStatus(status: number, skipUnauthorizedHandler: boolean | undefined): void {
  if (UNREACHABLE_STATUSES.has(status)) connectivity.reportNetworkFailure();
  else connectivity.reportServerReachable();
  if (status === 401 && !skipUnauthorizedHandler) unauthorizedHandler?.();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Performs a request and resolves with the parsed JSON body (`undefined` for 204 / empty bodies).
 * Rejects with `ApiError` (or the original `AbortError` when the request was cancelled).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const hasJsonBody = options.body !== undefined && !isFormData;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      headers: buildHeaders(method, options.headers, hasJsonBody),
      body: isFormData ? (options.body as FormData) : hasJsonBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    connectivity.reportNetworkFailure();
    throw networkError(error);
  }

  handleStatus(response.status, options.skipUnauthorizedHandler);

  const text = response.status === 204 ? '' : await response.text();
  const body = parseJson(text);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

type BodylessOptions = Omit<RequestOptions, 'method' | 'body'>;

export const api = {
  get: <T>(path: string, options?: BodylessOptions): Promise<T> => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: BodylessOptions): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = void>(path: string, options?: BodylessOptions): Promise<T> =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0…1, or `null` when the total size is unknown. */
  fraction: number | null;
}

export interface UploadOptions {
  method?: Extract<HttpMethod, 'POST' | 'PUT'>;
  /** Multipart field name for the file (`file` per ARCHITECTURE §5). */
  fieldName?: string;
  /** Extra multipart fields. */
  fields?: Readonly<Record<string, string>>;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Multipart upload with progress events (XHR – `fetch` has no upload progress).
 * Same CSRF/credential/error semantics as `apiRequest`.
 */
export function uploadFile<T>(path: string, file: Blob, options: UploadOptions = {}): Promise<T> {
  const { method = 'POST', fieldName = 'file', fields, onProgress, signal } = options;
  const form = new FormData();
  if (fields) for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file instanceof File) form.append(fieldName, file, file.name);
  else form.append(fieldName, file);

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload abgebrochen.', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(method, buildUrl(path));
    xhr.withCredentials = false; // same-origin requests always carry the session cookie
    xhr.responseType = 'text';
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader(CSRF_HEADER, CSRF_HEADER_VALUE);

    const onAbort = (): void => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort);

    xhr.upload.onprogress = (event: ProgressEvent) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        fraction: event.lengthComputable && event.total > 0 ? event.loaded / event.total : null,
      });
    };
    xhr.onload = () => {
      cleanup();
      handleStatus(xhr.status, false);
      const body = parseJson(typeof xhr.responseText === 'string' ? xhr.responseText : '');
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(toApiError(xhr.status, body));
    };
    xhr.onerror = () => {
      cleanup();
      connectivity.reportNetworkFailure();
      reject(networkError());
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload abgebrochen.', 'AbortError'));
    };
    xhr.send(form);
  });
}
