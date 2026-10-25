import { useWindowDimensions, Platform } from 'react-native';

/**
 * Desktop breakpoint. Electron windows are almost always >= 1024px wide;
 * phones/tablets in portrait or split-view rarely are. Adjust if you want
 * tablets to also get the desktop treatment.
 */
export const DESKTOP_BREAKPOINT = 900;

/** Max width for centered content columns on large screens. */
export const DESKTOP_CONTENT_MAX_WIDTH = 1180;

/**
 * Returns true when running on web/desktop AND the window is wide enough
 * to be a desktop layout (as opposed to a narrow mobile browser tab).
 * Updates live if the Electron window is resized.
 */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

/**
 * Convenience: returns both the flag and the raw width, in case a screen
 * wants finer-grained breakpoints (e.g. 2-column vs 3-column grids).
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isWide = Platform.OS === 'web' && width >= 1440;
  return { width, height, isDesktop, isWide };
}
