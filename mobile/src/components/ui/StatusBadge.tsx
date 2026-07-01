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

const STATUS_TO_STATE: Record<StatusKey, keyof typeof AppColors.state> = {
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

const STATUS_LABEL: Record<StatusKey, string> = {
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
  const stateKey = STATUS_TO_STATE[status];
  const token = AppColors.state[stateKey];
  const sizeStyles = size === 'sm' ? styles.sizeSm : styles.sizeMd;
  const textSize = size === 'sm' ? styles.textSm : styles.textMd;

  return (
    <View
      style={[
        styles.base,
        sizeStyles,
        { backgroundColor: token.bg, borderColor: token.border },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label ?? STATUS_LABEL[status]}
    >
      <Text style={[textSize, { color: token.text }]}>
        {label ?? STATUS_LABEL[status]}
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
