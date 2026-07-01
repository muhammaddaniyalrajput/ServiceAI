/**
 * StatusBadge — soft-tinted status pill for the KaamEasy AI design system.
 * Renders any of the canonical booking statuses as a premium, low-contrast pill.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { AppColors, Radius, FontWeight } from '../../constants/theme';

export type StatusKey =
  | 'pending'
  | 'pending_acceptance'
  | 'accepted'
  | 'confirmed'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'rejected';

export type BadgeSize = 'sm' | 'md';

export interface StatusBadgeProps {
  status: StatusKey;
  size?: BadgeSize;
  label?: string;
  style?: ViewStyle;
}

const UNKNOWN_TOKEN: keyof typeof AppColors.state = 'neutral';

const TOKEN_MAP: Record<string, keyof typeof AppColors.state> = {
  pending:            'warning',
  pending_acceptance: 'warning',
  accepted:           'info',
  confirmed:          'info',
  on_the_way:         'info',
  arrived:            'info',
  in_progress:        'warning',
  completed:          'success',
  cancelled:          'neutral',
  failed:             'danger',
  rejected:           'danger',
};

const LABEL_MAP: Record<string, string> = {
  pending:            'Pending',
  pending_acceptance: 'Awaiting',
  accepted:           'Accepted',
  confirmed:          'Confirmed',
  on_the_way:         'On the way',
  arrived:            'Arrived',
  in_progress:        'In progress',
  completed:          'Completed',
  cancelled:          'Cancelled',
  failed:             'Failed',
  rejected:           'Rejected',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  label,
  style,
}) => {
  // Defensive lookups: if `status` is unknown (e.g. 'searching', 'ranking',
  // 'broadcasting' or `undefined` from a race during initial Firestore load),
  // fall back to the neutral token. If even the token map is missing,
  // fall back to a hard-coded slate-grey token so the component never crashes.
  const FALLBACK_TOKEN = { bg: 'rgba(148,163,184,0.10)', text: '#cbd5e1', border: 'rgba(148,163,184,0.30)' };
  const stateKey = (TOKEN_MAP[status] ?? UNKNOWN_TOKEN) as keyof typeof AppColors.state;
  const token = AppColors?.state?.[stateKey] ?? FALLBACK_TOKEN;
  const sizeStyles = size === 'sm' ? styles.sizeSm : styles.sizeMd;
  const textSize = size === 'sm' ? styles.textSm : styles.textMd;
  const displayLabel = label ?? LABEL_MAP[status] ?? status ?? '—';

  return (
    <View
      style={[
        styles.base,
        sizeStyles,
        { backgroundColor: token.bg, borderColor: token.border },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={displayLabel}
    >
      <Text style={[textSize, { color: token.text }]} numberOfLines={1}>
        {displayLabel}
      </Text>
    </View>
  );
};

interface Style {
  base: ViewStyle;
  sizeSm: ViewStyle;
  sizeMd: ViewStyle;
  textSm: TextStyle;
  textMd: TextStyle;
}

const styles = StyleSheet.create<Style>({
  base: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  sizeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sizeMd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  textSm: {
    fontSize: 11,
    fontWeight: FontWeight.bold as TextStyle['fontWeight'],
    letterSpacing: 0.3,
  },
  textMd: {
    fontSize: 12,
    fontWeight: FontWeight.bold as TextStyle['fontWeight'],
    letterSpacing: 0.3,
  },
});
