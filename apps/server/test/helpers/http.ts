import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE, SESSION_COOKIE_NAME } from '@homi/shared';
import { TEST_APP_URL } from './config';

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface TestRequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** Send the `X-Homi-Request: 1` header on mutations (default: true). */
  csrf?: boolean;
  /** `Origin` header for mutations (default: APP_URL; `null` = omit). */
  origin?: string | null;
  /** Raw payload (Buffer/string) instead of JSON, e.g. multipart bodies. */
  rawBody?: Buffer | string;
  remoteAddress?: string;
}

/**
 * Cookie-aware wrapper around `app.inject()` that behaves like the SPA:
 * keeps cookies between requests, sends JSON, and adds the CSRF header + same-origin `Origin`
 * on mutating requests.
 *
 *   const client = new TestClient(app);
 *   await client.post('/api/auth/login', { email, password });
 *   const me = await client.get('/api/auth/me');
 */
export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(private readonly app: FastifyInstance) {}

  get sessionToken(): string | undefined {
    return this.cookies.get(SESSION_COOKIE_NAME);
  }

  setCookie(name: string, value: string): this {
    this.cookies.set(name, value);
    return this;
  }

  clearCookies(): this {
    this.cookies.clear();
    return this;
  }

  /** `Cookie` header value for the current jar (useful for socket.io-client `extraHeaders`). */
  cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(
    method: Method,
    url: string,
    payload?: unknown,
    options: TestRequestOptions = {},
  ): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {};
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (isMutation && options.csrf !== false) headers[CSRF_HEADER_NAME.toLowerCase()] = CSRF_HEADER_VALUE;
    if (isMutation && options.origin !== null) headers.origin = options.origin ?? TEST_APP_URL;
    if (this.cookies.size > 0) headers.cookie = this.cookieHeader();
    Object.assign(headers, options.headers);

    const injectOptions: InjectOptions = { method, url, headers };
    if (options.query) injectOptions.query = options.query;
    if (options.remoteAddress) injectOptions.remoteAddress = options.remoteAddress;
    if (options.rawBody !== undefined) {
      injectOptions.payload = options.rawBody;
    } else if (payload !== undefined) {
      injectOptions.payload = JSON.stringify(payload);
      headers['content-type'] ??= 'application/json';
    }

    const response = await this.app.inject(injectOptions);
    this.storeCookies(response);
    return response;
  }

  get(url: string, options?: TestRequestOptions) {
    return this.request('GET', url, undefined, options);
  }

  post(url: string, payload?: unknown, options?: TestRequestOptions) {
    return this.request('POST', url, payload, options);
  }

  put(url: string, payload?: unknown, options?: TestRequestOptions) {
    return this.request('PUT', url, payload, options);
  }

  patch(url: string, payload?: unknown, options?: TestRequestOptions) {
    return this.request('PATCH', url, payload, options);
  }

  delete(url: string, payload?: unknown, options?: TestRequestOptions) {
    return this.request('DELETE', url, payload, options);
  }

  private storeCookies(response: LightMyRequestResponse): void {
    for (const cookie of response.cookies) {
      const expired =
        cookie.value === '' ||
        (typeof cookie.maxAge === 'number' && cookie.maxAge <= 0) ||
        (cookie.expires instanceof Date && cookie.expires.getTime() <= Date.now());
      if (expired) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
  }
}
