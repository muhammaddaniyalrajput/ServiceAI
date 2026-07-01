/**
 * ChatBubble — single message bubble for the KaamEasy Provider design system.
 * Renders a soft-tinted system pill for system messages, or a corner-asymmetric
 * bubble with an avatar circle for incoming customer / provider messages.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { AppColors, FontWeight, Radius } from '@/constants/theme';

export type ChatSenderType = 'customer' | 'provider' | 'system';

export interface ChatBubbleProps {
  text: string;
  isMe: boolean;
  avatarLabel?: string;
  senderType: ChatSenderType;
  style?: ViewStyle;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  text,
  isMe,
  avatarLabel,
  senderType,
  style,
}) => {
  if (senderType === 'system') {
    return (
      <View style={[styles.systemRow, style]}>
        <View style={styles.systemPill}>
          <Text style={styles.systemText}>{text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        isMe ? styles.rowMe : styles.rowThem,
        style,
      ]}
    >
      {!isMe ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(avatarLabel ?? '·').charAt(0).toUpperCase()}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
        ]}
      >
        <Text style={[styles.text, isMe ? styles.textMe : styles.textThem]}>
          {text}
        </Text>
      </View>
    </View>
  );
};

interface Style {
  row: ViewStyle;
  rowMe: ViewStyle;
  rowThem: ViewStyle;
  avatar: ViewStyle;
  avatarText: TextStyle;
  bubble: ViewStyle;
  bubbleMe: ViewStyle;
  bubbleThem: ViewStyle;
  text: TextStyle;
  textMe: TextStyle;
  textThem: TextStyle;
  systemRow: ViewStyle;
  systemPill: ViewStyle;
  systemText: TextStyle;
}

const styles = StyleSheet.create<Style>({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  rowMe: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.surface2,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: AppColors.textSecondary,
    fontSize: 13,
    fontWeight: FontWeight.bold as TextStyle['fontWeight'],
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  bubbleMe: {
    backgroundColor: AppColors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderBottomLeftRadius: 4,
  },

  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  textMe: { color: '#000000' },
  textThem: { color: AppColors.textPrimary },

  systemRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    width: '100%',
  },
  systemPill: {
    backgroundColor: AppColors.surface,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AppColors.border,
    maxWidth: '88%',
  },
  systemText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: FontWeight.medium as TextStyle['fontWeight'],
  },
});
