import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@homi/shared';
import { useConnectivityStore } from '@/lib/connectivity';
import {
  ApiError,
  api,
  apiRequest,
  buildUrl,
  CSRF_HEADER,
  CSRF_HEADER_VALUE as CLIENT_CSRF_VALUE,
  NETWORK_ERROR_CODE,
  setUnauthorizedHandler,
  toApiError,
  uploadFile,
} from './client';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(response: Response | (() => Promise<Response>)): FetchMock {
  const fn = vi.fn<typeof fetch>(async () => (typeof response === 'function' ? response() : response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function lastInit(fn: FetchMock): RequestInit {
  const call = fn.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  return call[1] ?? {};
}

function headersOf(fn: FetchMock): Headers {
  return new Headers(lastInit(fn).headers);
}

beforeEach(() => {
  useConnectivityStore.setState({ browserOnline: true, serverReachable: true, lastFailureAt: null });
});

afterEach(() => {
  setUnauthorizedHandler(null);
});

describe('CSRF header', () => {
  it('mirrors the shared contract constants', () => {
    expect(CSRF_HEADER).toBe(CSRF_HEADER_NAME);
    expect(CLIENT_CSRF_VALUE).toBe(CSRF_HEADER_VALUE);
  });

  it('is not sent on GET requests, which use same-origin credentials', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { ok: true }));
    await api.get('/api/households');
    expect(fetchMock).toHaveBeenCalledWith('/api/households', expect.objectContaining({ method: 'GET' }));
    expect(lastInit(fetchMock).credentials).toBe('same-origin');
    expect(headersOf(fetchMock).has('X-Homi-Request')).toBe(false);
    expect(headersOf(fetchMock).get('Accept')).toBe('application/json');
  });

  it.each(['post', 'put', 'patch'] as const)('is sent on %s with a JSON body', async (method) => {
    const fetchMock = mockFetch(jsonResponse(200, { id: '1' }));
    await api[method]('/api/households', { name: 'WG Basel' });
    const headers = headersOf(fetchMock);
    expect(headers.get('X-Homi-Request')).toBe('1');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(lastInit(fetchMock).body).toBe(JSON.stringify({ name: 'WG Basel' }));
    expect(lastInit(fetchMock).method).toBe(method.toUpperCase());
  });

  it('is sent on DELETE without a body', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));
    await expect(api.delete('/api/households/h1/items/i1')).resolves.toBeUndefined();
    expect(headersOf(fetchMock).get('X-Homi-Request')).toBe('1');
    expect(lastInit(fetchMock).body).toBeUndefined();
  });

  it('is sent with multipart bodies and leaves the content type to the browser', async () => {
    const fetchMock = mockFetch(jsonResponse(201, { id: 'img' }));
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');
    await apiRequest('/api/households/h1/images', { method: 'POST', body: form });
    const headers = headersOf(fetchMock);
    expect(headers.get('X-Homi-Request')).toBe('1');
    expect(headers.has('Content-Type')).toBe(false);
    expect(lastInit(fetchMock).body).toBe(form);
  });
});

describe('error mapping', () => {
  it('maps the error envelope to ApiError { status, code, message, details }', async () => {
    const details = { fieldErrors: { name: 'Bitte gib einen Namen ein.' }, formErrors: [] };
    mockFetch(
      jsonResponse(400, { error: { code: 'VALIDATION', message: 'Bitte überprüfe deine Eingaben.', details } }),
    );
    const error = await api.post('/api/households', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION',
      message: 'Bitte überprüfe deine Eingaben.',
      details,
    });
    expect((error as ApiError).isClientError).toBe(true);
  });

  it('keeps domain error codes such as VERSION_CONFLICT', async () => {
    mockFetch(jsonResponse(409, { error: { code: 'VERSION_CONFLICT', message: 'Geändert.' } }));
    await expect(api.patch('/api/households/h/items/i', { version: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Geändert.',
    });
  });

  it('falls back to German defaults for bodies without an envelope', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 500 }));
    await expect(api.get('/api/households')).rejects.toMatchObject({ status: 500, code: 'SERVER_ERROR' });
    expect(toApiError(404, undefined)).toMatchObject({ code: 'NOT_FOUND', message: 'Nicht gefunden.' });
    expect(toApiError(418, { error: 'nope' })).toMatchObject({ status: 418, code: 'REQUEST_FAILED' });
  });

  it('turns network failures into NETWORK_ERROR and marks the server unreachable until a response arrives', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await api.get('/api/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: NETWORK_ERROR_CODE });
    expect((error as ApiError).isNetworkError).toBe(true);
    expect(useConnectivityStore.getState().serverReachable).toBe(false);

    mockFetch(jsonResponse(200, {}));
    await api.get('/api/health');
    expect(useConnectivityStore.getState().serverReachable).toBe(true);
  });

  it('treats gateway errors (502/504) as an unreachable server', async () => {
    mockFetch(new Response('', { status: 502 }));
    await expect(api.get('/api/households')).rejects.toMatchObject({ status: 502 });
    expect(useConnectivityStore.getState().serverReachable).toBe(false);
  });

  it('rethrows aborts unchanged (not as ApiError)', async () => {
    mockFetch(() => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')));
    const error = await api.get('/api/households').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(useConnectivityStore.getState().serverReachable).toBe(true);
  });
});

describe('401 handling', () => {
  it('calls the unauthorized handler (→ invalidate ["me"])', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Bitte melde dich an.' } }));
    await expect(api.get('/api/households')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can be skipped (e.g. for /auth/me and login)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'E-Mail oder Passwort ist falsch.' } }),
    );
    await expect(
      api.post('/api/auth/login', { email: 'a@b.ch', password: 'x' }, { skipUnauthorizedHandler: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('buildUrl', () => {
  it('drops empty query values and repeats arrays', () => {
    expect(
      buildUrl('/api/households/h/items', { search: 'Milch', category: undefined, sort: '', cursor: null, limit: 20 }),
    ).toBe('/api/households/h/items?search=Milch&limit=20');
    expect(buildUrl('api/x', { tag: ['a', 'b'] })).toBe('/api/x?tag=a&tag=b');
    expect(buildUrl('/api/x', { q: 'Käse & Brot' })).toBe('/api/x?q=K%C3%A4se+%26+Brot');
  });
});

describe('uploadFile (XHR with progress)', () => {
  class FakeXhr {
    static last: FakeXhr | null = null;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    status = 0;
    responseText = '';
    responseType = '';
    withCredentials = false;
    body: unknown = null;
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value;
    }
    send(body: unknown): void {
      this.body = body;
    }
    abort(): void {
      this.onabort?.();
    }
  }

  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('sends the CSRF header, reports progress and resolves with JSON', async () => {
    const onProgress = vi.fn();
    const file = new File(['abc'], 'foto.jpg', { type: 'image/jpeg' });
    const promise = uploadFile<{ id: string }>('/api/households/h1/images', file, { onProgress });
    const xhr = FakeXhr.last;
    if (!xhr) throw new Error('no xhr');
    expect(xhr.method).toBe('POST');
    expect(xhr.headers['X-Homi-Request']).toBe('1');
    expect(xhr.body).toBeInstanceOf(FormData);
    expect((xhr.body as FormData).get('file')).toBeInstanceOf(File);

    xhr.upload.onprogress?.({ loaded: 50, total: 100, lengthComputable: true } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 100, fraction: 0.5 });

    xhr.status = 201;
    xhr.responseText = JSON.stringify({ id: 'img-1', width: 10, height: 10 });
    xhr.onload?.();
    await expect(promise).resolves.toMatchObject({ id: 'img-1' });
  });

  it('maps error responses like fetch requests', async () => {
    const promise = uploadFile('/api/households/h1/images', new Blob(['x']));
    const xhr = FakeXhr.last;
    if (!xhr) throw new Error('no xhr');
    xhr.status = 415;
    xhr.responseText = JSON.stringify({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Format nicht unterstützt.' },
    });
    xhr.onload?.();
    await expect(promise).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('rejects with AbortError when the signal aborts', async () => {
    const controller = new AbortController();
    const promise = uploadFile('/api/households/h1/images', new Blob(['x']), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
