/**
 * Toast — Lightweight in-app notification toast that slides in from the top
 * and auto-dismisses. Replaces Alert.alert() for non-critical feedback.
 *
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast('Profile saved!', 'success');
 *   // Render <ToastContainer /> somewhere inside your screen root.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  Text,
  StyleSheet,
  Platform,
  View,
  TouchableOpacity,
} from 'react-native';
import { useNativeDriver } from '../../utils/animation';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

// ─── Toast config ──────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', icon: '✓', border: 'rgba(16,185,129,0.4)' },
  error:   { bg: 'rgba(239,68,68,0.12)',  icon: '✕', border: 'rgba(239,68,68,0.4)'  },
  info:    { bg: 'rgba(99,102,241,0.12)', icon: 'ℹ', border: 'rgba(99,102,241,0.4)' },
  warning: { bg: 'rgba(245,158,11,0.12)', icon: '⚠', border: 'rgba(245,158,11,0.4)' },
};

const TEXT_COLOR: Record<ToastType, string> = {
  success: '#34d399',
  error:   '#f87171',
  info:    '#818cf8',
  warning: '#fbbf24',
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3200) => {
      // Cancel any pending dismiss
      if (timerRef.current) clearTimeout(timerRef.current);

      setToast({ visible: true, message, type });

      // Slide in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver,
          damping: 18,
          stiffness: 160,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver,
        }),
      ]).start();

      // Auto-dismiss
      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -120,
            duration: 280,
            useNativeDriver,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 280,
            useNativeDriver,
          }),
        ]).start(() => setToast((p) => ({ ...p, visible: false })));
      }, duration);
    },
    [],
  );

  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver }),
    ]).start(() => setToast((p) => ({ ...p, visible: false })));
  }, []);

  const ToastContainer = useCallback(() => {
    if (!toast.visible) return null;
    const cfg = TOAST_CONFIG[toast.type];
    const textColor = TEXT_COLOR[toast.type];

    return (
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
            transform: [{ translateY }],
            opacity,
            pointerEvents: 'box-none',
          },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconBadge, { borderColor: cfg.border }]}>
            <Text style={[styles.iconText, { color: textColor }]}>{cfg.icon}</Text>
          </View>
          <Text style={[styles.message, { color: textColor }]} numberOfLines={2}>
            {toast.message}
          </Text>
          <TouchableOpacity onPress={hideToast} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: textColor }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }, [toast, translateY, opacity]);

  return { showToast, hideToast, ToastContainer };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 9999,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  closeBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  closeText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.7,
  },
});
