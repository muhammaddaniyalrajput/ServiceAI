/**
 * Animation helpers — centralized platform-safe animation flags.
 *
 * React Native's native animated module is not available on web; the
 * `useNativeDriver: true` option falls back to JS and emits a console
 * warning every time it is used. This module exposes a single
 * `useNativeDriver` constant that components should import so the
 * behaviour is consistent across the app and the warnings disappear.
 */
import { Platform } from 'react-native';

export const useNativeDriver: boolean = Platform.OS !== 'web';
