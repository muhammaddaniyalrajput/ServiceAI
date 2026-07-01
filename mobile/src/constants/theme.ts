/**
 * KaamEasy AI — Customer (indigo-led) design tokens.
 * Mirrors mobile-provider/src/constants/theme.ts: same token shapes, distinct hex values.
 * All customer screens must import from this file instead of inlining hex strings.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0f172a',
    background: '#ffffff',
    backgroundElement: '#F4F4F7',
    backgroundSelected: '#E5E7EB',
    textSecondary: '#4B5563',
  },
  dark: {
    text: '#f1f5f9',
    background: '#0f172a',
    backgroundElement: '#1e293b',
    backgroundSelected: '#334155',
    textSecondary: '#94a3b8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * AppColors — Semantic design tokens for the KaamEasy AI customer app.
 * Reference these in every customer screen instead of raw hex strings.
 */
export const AppColors = {
  // ── Backgrounds ──────────────────────────────────────────────
  bg:           '#0f172a',   // Root / page background
  surface:      '#1e293b',   // Card / sheet background
  surface2:     '#243044',   // Elevated element (chips, badges)
  overlay:      '#334155',   // Input backgrounds, secondary buttons

  // ── Borders ──────────────────────────────────────────────────
  border:       '#334155',
  borderSubtle: '#243044',

  // ── Brand / Status colours ────────────────────────────────────
  primary:      '#6366f1',   // KaamEasy indigo — main accent
  success:      '#10b981',   // Green — positive / accepted
  warning:      '#f59e0b',   // Amber — pending / caution
  danger:       '#ef4444',   // Red — error / decline
  info:         '#3b82f6',   // Blue — informational

  // ── Text ─────────────────────────────────────────────────────
  textPrimary:   '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted:     '#64748b',
  textDisabled:  '#475569',

  // ── State — soft-tinted variants for badges & pills ──────────
  state: {
    success: { bg: 'rgba(16,185,129,0.10)', text: '#34d399', border: 'rgba(16,185,129,0.30)' },
    warning: { bg: 'rgba(245,158,11,0.10)', text: '#fbbf24', border: 'rgba(245,158,11,0.30)' },
    danger:  { bg: 'rgba(239,68,68,0.10)',  text: '#f87171', border: 'rgba(239,68,68,0.30)'  },
    info:    { bg: 'rgba(59,130,246,0.10)', text: '#60a5fa', border: 'rgba(59,130,246,0.30)' },
    neutral: { bg: 'rgba(148,163,184,0.10)', text: '#cbd5e1', border: 'rgba(148,163,184,0.30)' },
  },
} as const;

export type AppStateToken = keyof typeof AppColors.state;

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
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 },  shadowOpacity: 0.10, shadowRadius: 2,  elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 },  shadowOpacity: 0.18, shadowRadius: 8,  elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 },  shadowOpacity: 0.24, shadowRadius: 16, elevation: 8 },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
