/**
 * EmptyState — premium, centered empty-state for the KaamEasy Provider design system.
 * Renders an icon, title, optional body, and optional CTA. Every call site must
 * pass an explicit `title` (no default brand fallback) so copy stays intentional.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { AppColors, FontWeight, Radius, Spacing } from '@/constants/theme';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

export interface EmptyStateProps {
  icon: string;
  title: string;
  body?: string;
  action?: EmptyStateAction;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  body,
  action,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrapper}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <TouchableOpacity style={styles.actionButton} onPress={action.onPress} activeOpacity={0.85}>
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.twelve,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.four,
  },
  icon: {
    fontSize: 32,
    opacity: 0.55,
  },
  title: {
    color: AppColors.textPrimary,
    fontSize: 17,
    fontWeight: '700' as TextStyle['fontWeight'],
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: AppColors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.three,
  },
  actionButton: {
    marginTop: Spacing.six,
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: Radius.md,
  },
  actionText: {
    color: '#000',
    fontSize: 14,
    fontWeight: FontWeight.bold as TextStyle['fontWeight'],
  },
});
