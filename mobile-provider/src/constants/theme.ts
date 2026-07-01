/**
 * KaamEasy Provider — cyan-led design tokens.
 * Mirrors mobile/src/constants/theme.ts: same token shapes, distinct hex values.
 * All provider screens must import from this file instead of inlining hex strings.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * AppColors — Semantic design tokens for the KaamEasy Provider app.
 * All provider screens should reference these instead of raw hex strings.
 */
export const AppColors = {
  // ── Backgrounds ──────────────────────────────────────────────
  bg:           '#1a1a1a',   // Root/page background
  surface:      '#2a2a2a',   // Card / sheet background
  surface2:     '#333333',   // Elevated element (chips, badges)
  overlay:      '#404040',   // Input backgrounds, secondary buttons

  // ── Borders ──────────────────────────────────────────────────
  border:       '#404040',
  borderSubtle: '#333333',

  // ── Brand / Status colours ────────────────────────────────────
  primary:      '#00bfff',   // Cyan – main accent
  success:      '#00ff88',   // Green – positive / accepted
  warning:      '#ff8800',   // Amber – pending / caution
  danger:       '#ff4444',   // Red – error / decline
  info:         '#00bfff',   // Blue – informational (alias of primary for cyan-led app)
  purple:       '#8b5cf6',   // Purple – special states

  // ── Text ─────────────────────────────────────────────────────
  textPrimary:   '#ffffff',
  textSecondary: '#aaaaaa',
  textMuted:     '#666666',
  textDisabled:  '#525252',

  // ── Earnings card ────────────────────────────────────────────
  earningsBg:    '#003366',

  // ── State — soft-tinted variants for badges & pills ──────────
  state: {
    success: { bg: 'rgba(0,255,136,0.10)', text: '#00ff88', border: 'rgba(0,255,136,0.30)' },
    warning: { bg: 'rgba(255,136,0,0.10)', text: '#ff8800', border: 'rgba(255,136,0,0.30)' },
    danger:  { bg: 'rgba(255,68,68,0.10)', text: '#ff8888', border: 'rgba(255,68,68,0.30)' },
    info:    { bg: 'rgba(0,191,255,0.10)', text: '#00bfff', border: 'rgba(0,191,255,0.30)' },
    neutral: { bg: 'rgba(170,170,170,0.10)', text: '#aaaaaa', border: 'rgba(170,170,170,0.30)' },
  },
} as const;

export type AppStateToken = keyof typeof AppColors.state;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  zero: 0,
  hairline: 1,
  px: 2,
  half: 2,
  one: 4,
  oneHalf: 6,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  eight: 32,
  ten: 40,
  twelve: 48,
  sixteen: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  full: 999,
} as const;

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export type FontWeightKey = keyof typeof FontWeight;

export const Typography = {
  caption: { size: 12, lineHeight: 16, weight: 'medium'    as FontWeightKey },
  bodySm:  { size: 13, lineHeight: 18, weight: 'regular'   as FontWeightKey },
  body:    { size: 14, lineHeight: 20, weight: 'regular'   as FontWeightKey },
  bodyLg:  { size: 15, lineHeight: 22, weight: 'regular'   as FontWeightKey },
  label:   { size: 13, lineHeight: 18, weight: 'semibold'  as FontWeightKey },
  h4:      { size: 16, lineHeight: 22, weight: 'bold'      as FontWeightKey },
  h3:      { size: 18, lineHeight: 24, weight: 'bold'      as FontWeightKey },
  h2:      { size: 22, lineHeight: 28, weight: 'extrabold' as FontWeightKey },
  h1:      { size: 28, lineHeight: 34, weight: 'extrabold' as FontWeightKey },
  display: { size: 32, lineHeight: 40, weight: 'extrabold' as FontWeightKey },
} as const;

export const Shadow = {
  sm: { boxShadow: '0 1px 2px rgba(0,0,0,0.12)',  elevation: 1 },
  md: { boxShadow: '0 4px 8px rgba(0,0,0,0.20)',  elevation: 4 },
  lg: { boxShadow: '0 8px 16px rgba(0,0,0,0.28)', elevation: 8 },
} as const;
