import React from 'react';
import { Alert as RNAlert } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────
// NATIVE (iOS/Android) version. Metro/Expo automatically picks
// AlertProvider.web.js instead of this file when building for web/Electron
// — see that file for why web needs a completely different implementation
// (a real DOM portal, not RN's <Modal>).
//
// On native, RN's own Alert.alert() already works correctly, so this is a
// thin pass-through. AlertProvider itself doesn't need to render anything
// here — it only exists so the same `import { AlertProvider } from
// '../components/AlertProvider'` in App.js works unchanged on both platforms.
// ─────────────────────────────────────────────────────────────────────────

export function AlertProvider({ children }) {
  return <>{children}</>;
}

export const Alert = {
  alert(title, message, buttons) {
    RNAlert.alert(title, message, buttons);
  },
};
