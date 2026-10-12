import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { SmtpConfig } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outgoing mail (password reset only). Disabled unless SMTP_* is configured. */
export interface Mailer {
  isEnabled(): boolean;
  /** Sends a message; throws when disabled or when the transport fails. */
  send(message: MailMessage): Promise<void>;
  close(): void;
}

export class MailerDisabledError extends Error {
  constructor() {
    super('Mail delivery is not configured (SMTP_HOST / SMTP_FROM missing)');
    this.name = 'MailerDisabledError';
  }
}

export function createMailer(smtp: SmtpConfig | null, logger?: FastifyBaseLogger): Mailer {
  if (!smtp) {
    return {
      isEnabled: () => false,
      send: () => Promise.reject(new MailerDisabledError()),
      close: () => undefined,
    };
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
  });

  return {
    isEnabled: () => true,
    async send(message) {
      const info = await transport.sendMail({ from: smtp.from, ...message });
      logger?.info({ messageId: info.messageId }, 'mail sent');
    },
    close: () => transport.close(),
  };
}

/** In-memory mailer for tests: records every message instead of sending it. */
export function createMemoryMailer(): Mailer & { readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    isEnabled: () => true,
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
    close: () => undefined,
  };
}
