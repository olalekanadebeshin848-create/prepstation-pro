import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────
// WEB/ELECTRON version. Metro/Expo picks this file automatically over
// AlertProvider.js when bundling for web — no import changes needed
// anywhere else in the app.
//
// Why this exists (2nd iteration):
// React Native's Alert.alert() has no real web implementation, so a custom
// dialog is needed. The FIRST fix wrapped it in RN's <Modal>, but every
// react-native-web <Modal> is its own position:fixed layer — those don't
// compare by z-index against each OTHER, they compare by mount order, so
// whichever Modal (e.g. the PG Map overlay) was inserted more recently
// always sat on top, regardless of z-index set on content inside a
// DIFFERENT Modal.
//
// The SECOND fix dropped <Modal> for a plain position:'fixed' View with an
// explicit huge z-index — closer, but still not reliable, because
// position:fixed only escapes to the real viewport if NO ancestor has a
// CSS `transform` set. React Navigation's screen containers (used for
// slide/fade transitions) commonly do set `transform` — so the "fixed"
// alert could still end up trapped and scoped inside that transformed
// screen container instead of the real viewport, right back to competing
// unpredictably against the PG Map overlay's own real Modal portal.
//
// This version uses a REAL DOM portal (ReactDOM.createPortal) straight into
// document.body — the exact same technique react-native-web's own <Modal>
// uses internally. That guarantees it's a genuine sibling of every other
// Modal's portal at the body level, completely bypassing any transformed
// ancestor anywhere in the component tree. Its z-index is then set directly
// on that body-level node, so it reliably outranks any other body-level
// layer that doesn't set an explicit z-index of its own (which is every
// other Modal in this app, PG Map included).
// ─────────────────────────────────────────────────────────────────────────

let showImpl = null;

/**
 * Mount this once near the root of the app (in App.js), above everything
 * else — matches the native version's usage exactly.
 */
export function AlertProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, buttons }

  showImpl = (title, message, buttons) => {
    const normalized =
      buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    setState({ title, message, buttons: normalized });
  };

  const handlePress = (btn) => {
    setState(null);
    if (btn && typeof btn.onPress === 'function') {
      setTimeout(() => btn.onPress(), 0);
    }
  };

  const dialog = state ? (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {!!state.title && <Text style={styles.title}>{state.title}</Text>}
        {!!state.message && <Text style={styles.message}>{state.message}</Text>}
        <View style={styles.buttonRow}>
          {state.buttons.map((btn, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.button,
                btn.style === 'cancel' && styles.cancelButton,
                btn.style === 'destructive' && styles.destructiveButton,
              ]}
              activeOpacity={0.75}
              onPress={() => handlePress(btn)}
            >
              <Text
                style={[
                  styles.buttonText,
                  btn.style === 'cancel' && styles.cancelText,
                  btn.style === 'destructive' && styles.destructiveText,
                ]}
              >
                {btn.text || 'OK'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  ) : null;

  return (
    <>
      {children}
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}

/**
 * Drop-in replacement for React Native's Alert. Import this instead of
 * { Alert } from 'react-native' in any screen that needs Alert.alert().
 */
export const Alert = {
  alert(title, message, buttons) {
    if (showImpl) {
      showImpl(title, message, buttons);
    } else {
      // AlertProvider not mounted yet — extremely rare fallback
      window.alert(`${title}${message ? '\n\n' + message : ''}`);
    }
  },
};

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    // Explicit and enormous on purpose: a real body-level node with an
    // explicit z-index always outranks a sibling body-level node (like any
    // other Modal's portal — PG Map, teacher code entry, hero blueprint,
    // etc.) that left its z-index at 'auto', regardless of which one was
    // inserted into the page first or most recently.
    zIndex: 999999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 14,
    boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#312e81',
    minWidth: 72,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e2e8f0',
  },
  destructiveButton: {
    backgroundColor: '#dc2626',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  cancelText: {
    color: '#334155',
  },
  destructiveText: {
    color: '#ffffff',
  },
});
