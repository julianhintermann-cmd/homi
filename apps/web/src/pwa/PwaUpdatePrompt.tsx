import { AnimatePresence, motion } from 'motion/react';
import { Toast } from '@/components/Toast';
import { usePwaUpdate } from './usePwaUpdate';

/** In-app "Update verfügbar" prompt for the waiting service worker. */
export function PwaUpdatePrompt() {
  const { updateAvailable, applyUpdate, dismissUpdate } = usePwaUpdate();

  return (
    <div className="app-update-toast">
      <AnimatePresence>
        {updateAvailable ? (
          <motion.div
            key="pwa-update"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <Toast
              message="Update verfügbar"
              actionLabel="Aktualisieren"
              onAction={() => void applyUpdate()}
              onDismiss={dismissUpdate}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
