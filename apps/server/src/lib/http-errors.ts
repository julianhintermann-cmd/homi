import { API_ERRORS, type ApiErrorBody, type ApiErrorCode } from '@homi/shared';

/**
 * Domain/HTTP error rendered by the central error handler as
 * `{ error: { code, message, details? } }` with the status registered for `code`.
 *
 *   throw new AppError('LAST_OWNER');
 *   throw new AppError('NOT_FOUND', 'Artikel nicht gefunden.');
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  /** User-facing German message (also used as `Error#message`). */
  readonly expose = true;

  constructor(
    code: ApiErrorCode,
    message?: string,
    options: { details?: unknown; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message ?? API_ERRORS[code].message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode ?? API_ERRORS[code].status;
    this.details = options.details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export const badRequest = (message?: string, details?: unknown) => new AppError('BAD_REQUEST', message, { details });
export const unauthorized = (message?: string) => new AppError('UNAUTHORIZED', message);
export const forbidden = (message?: string) => new AppError('FORBIDDEN', message);
export const notFound = (message?: string) => new AppError('NOT_FOUND', message);
export const conflict = (message?: string, details?: unknown) => new AppError('CONFLICT', message, { details });

/** Builds an error body without throwing (e.g. for socket acks or hooks). */
export function errorBody(code: ApiErrorCode, message?: string, details?: unknown): ApiErrorBody {
  return new AppError(code, message, { details }).toBody();
}
