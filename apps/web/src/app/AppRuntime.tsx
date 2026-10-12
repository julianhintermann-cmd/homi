import { AnimatePresence, motion } from 'motion/react';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useMe } from '@/hooks/useAuth';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useConnectivity } from '@/hooks/useOnlineStatus';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useSocketConnection } from '@/hooks/useSocket';
import { useConnectivityRecovery } from './useConnectivityRecovery';

/**
 * App-wide side effects that do not belong to a single screen: the realtime connection
 * (only while signed in), query invalidation from socket events, keyboard inset tracking
 * and the offline banner.
 */
export function AppRuntime() {
  const { data: me } = useMe();
  const authenticated = Boolean(me);

  useSocketConnection(authenticated);
  useRealtimeSync(authenticated);
  useKeyboardInset();
  useConnectivityRecovery();

  const connectivity = useConnectivity();

  return (
    <AnimatePresence>
      {connectivity.reason ? (
        <motion.div
          key="offline-banner"
          className="app-offline-banner"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <OfflineBanner reason={connectivity.reason} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
