/**
 * ProgressSteps — horizontal step indicator for the KaamEasy AI design system.
 * Used for booking lifecycle: accepted → confirmed → on_the_way → arrived → in_progress → completed.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { AppColors, FontWeight, Radius } from '../../constants/theme';

export interface ProgressStep {
  key: string;
  label: string;
  /** Optional short glyph rendered inside the step dot. */
  glyph?: string;
}

export interface ProgressStepsProps {
  steps: ProgressStep[];
  /** Index of the current step. Steps at or below this index are "completed". */
  current: number;
  /** Color used for completed dots / connectors. Defaults to AppColors.primary. */
  color?: string;
  style?: ViewStyle;
}

export const ProgressSteps: React.FC<ProgressStepsProps> = ({
  steps,
  current,
  color = AppColors.primary,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {steps.map((step, idx) => {
        const isCompleted = idx <= current;
        const isCurrent = idx === current;
        return (
          <View key={step.key} style={styles.stepWrapper}>
            <View
              style={[
                styles.dot,
                isCompleted && { backgroundColor: color, borderColor: color },
                isCurrent && { shadowColor: color },
              ]}
            >
              {step.glyph ? (
                <Text
                  style={[
                    styles.glyph,
                    { color: isCompleted ? AppColors.textPrimary : AppColors.textMuted },
                  ]}
                >
                  {step.glyph}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                isCompleted ? { color: AppColors.textPrimary } : null,
                isCurrent ? { color, fontWeight: FontWeight.extrabold as TextStyle['fontWeight'] } : null,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
            {idx < steps.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  isCompleted ? { backgroundColor: color } : null,
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

interface Style {
  container: ViewStyle;
  stepWrapper: ViewStyle;
  dot: ViewStyle;
  glyph: TextStyle;
  label: TextStyle;
  connector: ViewStyle;
}

const styles = StyleSheet.create<Style>({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  stepWrapper: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surface,
    borderWidth: 2,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  glyph: {
    fontSize: 12,
    fontWeight: FontWeight.bold as TextStyle['fontWeight'],
  },
  label: {
    color: AppColors.textMuted,
    fontSize: 11,
    fontWeight: FontWeight.semibold as TextStyle['fontWeight'],
    textAlign: 'center',
  },
  connector: {
    position: 'absolute',
    top: 13,
    left: '62%',
    right: '-38%',
    height: 2,
    backgroundColor: AppColors.surface2,
    zIndex: -1,
  },
});
