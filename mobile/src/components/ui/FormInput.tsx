/**
 * FormInput — Reusable, animated text input with label, error, and optional
 * password-visibility toggle. Eliminates the duplicated InputField component
 * that was copy-pasted across Login, Signup, and LocationProfile screens.
 *
 * Design: dark glass surface (#1e293b), indigo focus ring, red error border.
 */
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
  TextInputProps,
} from 'react-native';
import { useNativeDriver } from '../../utils/animation';

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** Show the eye-toggle for password fields */
  isPassword?: boolean;
  /** Icon rendered on the left — just a string emoji/symbol works */
  leftIcon?: string;
}

export const FormInput = React.forwardRef<TextInput, FormInputProps>(
  (
    {
      label,
      error,
      isPassword = false,
      leftIcon,
      editable = true,
      value,
      onChangeText,
      ...rest
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    // Animated border color value: 0 = default, 1 = focused
    const focusAnim = useRef(new Animated.Value(0)).current;
    // Shake animation for errors
    const shakeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(focusAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }, [isFocused]);

    // Shake whenever a new error appears
    useEffect(() => {
      if (error) {
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver }),
          Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver }),
          Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver }),
          Animated.timing(shakeAnim, { toValue: -4, duration: 60, useNativeDriver }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver }),
        ]).start();
      }
    }, [error]);

    const borderColor = focusAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [
        error ? 'rgba(239,68,68,0.5)' : 'rgba(51,65,85,1)',
        error ? 'rgba(239,68,68,0.9)' : 'rgba(99,102,241,0.8)',
      ],
    });

    return (
      <Animated.View
        style={[styles.wrapper, { transform: [{ translateX: shakeAnim }] }]}
      >
        {/* Label */}
        <Text style={styles.label}>{label}</Text>

        {/* Input container */}
        <Animated.View style={[styles.inputContainer, { borderColor }]}>
          {leftIcon ? (
            <Text style={styles.leftIcon}>{leftIcon}</Text>
          ) : null}

          <TextInput
            ref={ref}
            style={[
              styles.input,
              leftIcon ? styles.inputWithIcon : null,
              !editable ? styles.inputDisabled : null,
            ]}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={isPassword && !showPassword}
            placeholderTextColor="#475569"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={editable}
            autoCorrect={false}
            {...rest}
          />

          {/* Password eye toggle */}
          {isPassword && (
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              style={styles.eyeToggle}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Error message */}
        {!!error && (
          <Text style={styles.error}>{error}</Text>
        )}
      </Animated.View>
    );
  },
);

FormInput.displayName = 'FormInput';

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        boxShadow: '0 0 8px #6366f1',
      },
    }),
  },
  leftIcon: {
    paddingLeft: 14,
    fontSize: 16,
  },
  input: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    letterSpacing: 0.1,
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
  inputDisabled: {
    opacity: 0.55,
  },
  eyeToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeIcon: {
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    fontSize: 11.5,
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '500',
  },
});
