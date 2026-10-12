import { Icon } from '@/icons/Icon';
import { cx } from './utils';

export interface OfflineBannerProps {
  /** `offline`: device has no network; `server-unreachable`: network ok, Homi server not answering. */
  reason?: 'offline' | 'server-unreachable';
  className?: string;
}

const MESSAGES: Record<NonNullable<OfflineBannerProps['reason']>, string> = {
  offline: 'Du bist offline. Änderungen sind erst wieder mit Verbindung möglich.',
  'server-unreachable': 'Server nicht erreichbar. Neuer Versuch läuft …',
};

/**
 * Connectivity banner: a compact glass capsule (same material as the toast) with a muted wifi
 * glyph and a `footnote-medium` message. Positioned by the app shell (`.app-offline-banner`).
 */
export function OfflineBanner({ reason = 'offline', className }: OfflineBannerProps) {
  return (
    <div role="status" aria-live="polite" className={cx('glass homi-offline-banner', className)} data-reason={reason}>
      <span className="homi-offline-banner__icon" aria-hidden="true">
        <Icon name="wifi" size={16} weight={1.8} />
      </span>
      <span className="homi-offline-banner__message">{MESSAGES[reason]}</span>
    </div>
  );
}
