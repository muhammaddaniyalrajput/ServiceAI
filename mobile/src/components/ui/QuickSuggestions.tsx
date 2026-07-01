/**
 * QuickSuggestions — horizontal chip rail of pre-canned reply suggestions.
 * Used by both ChatScreen and NegotiationChatSheet in the KaamEasy AI app.
 */
import React from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { AppColors, FontWeight, Radius, Spacing } from '../../constants/theme';

export interface QuickSuggestion {
  label: string;
  text: string;
}

export interface QuickSuggestionsProps {
  suggestions: QuickSuggestion[];
  onPick: (text: string) => void;
  style?: ViewStyle;
}

export const QuickSuggestions: React.FC<QuickSuggestionsProps> = ({
  suggestions,
  onPick,
  style,
}) => {
  if (suggestions.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, style]}
    >
      {suggestions.map((s) => (
        <TouchableOpacity
          key={s.label}
          style={styles.chip}
          activeOpacity={0.8}
          onPress={() => onPick(s.text)}
          accessibilityRole="button"
          accessibilityLabel={`Send suggestion: ${s.label}`}
        >
          <Text style={styles.label}>{s.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  chip: {
    backgroundColor: AppColors.surface2,
    borderColor: AppColors.border,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  label: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: FontWeight.bold as '700',
    letterSpacing: 0.2,
  },
});
