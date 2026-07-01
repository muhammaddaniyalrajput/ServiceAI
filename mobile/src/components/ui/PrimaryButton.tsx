/**
 * PrimaryButton — App-wide animated primary action button.
 * Features a scale-down press animation, loading spinner with label,
 * disabled opacity, and smooth color transitions.
 */
import React, { useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  Text,
  StyleSheet,
  View,
  ViewStyle,
  Platform,
  Pressable,
} from 'react-native';

interface PrimaryButtonProps {
  label: string;
  loadingLabel?: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Override background color — defaults to indigo */
  color?: string;
  /** Override disabled color */
  disabledColor?: string;
  style?: ViewStyle;
  /** Optional right-side arrow glyph */
  showArrow?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  loadingLabel,
  onPress,
  isLoading = false,
  disabled = false,
  color = '#6366f1',
  disabledColor = 'rgba(99,102,241,0.35)',
  style,
  showArrow = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Native driver is not supported on web (the native animated module is
  // missing) — falling back to the JS driver produces a console warning.
  // Use a single, centralized flag so the warning only fires once.
  const useNativeDriver = Platform.OS !== 'web';

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.button,
            { backgroundColor: isDisabled ? disabledColor : color },
            { transform: [{ scale: pressed && !isDisabled ? scaleAnim : 1 }] },
            pressed && !isDisabled && styles.buttonPressed,
            style,
          ]}
        >
          {isLoading ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.label}>{loadingLabel ?? label}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
                {label}
              </Text>
              {showArrow && (
                <Text style={[styles.arrow, isDisabled && styles.labelDisabled]}>→</Text>
              )}
            </View>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelDisabled: {
    opacity: 0.5,
  },
  arrow: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
});
