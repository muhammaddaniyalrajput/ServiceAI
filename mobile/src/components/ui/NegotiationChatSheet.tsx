/**
 * NegotiationChatSheet — KaamEasy AI customer chat bottom sheet.
 *
 * Used by the LiveTracking screen to let customers reopen the negotiation
 * conversation with their provider. Mirrors the design language of
 * ChatScreen so the two surfaces feel like one product.
 *
 * Pipeline (Phase 2 fix):
 *   - Send:  POST  /v1/bookings/{id}/chat
 *   - Read:  Firestore onSnapshot
 *   - The current user's UID is sourced strictly from `auth.currentUser?.uid`.
 *     If absent, the send button is disabled and an inline error is shown.
 *   - `sending` state disables the composer while a POST is in flight; the
 *     typed text is restored on failure so the user can retry.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  View,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { sendChatMessage as apiSendChatMessage } from '../../services/api';
import { ChatBubble, type ChatSenderType } from './ChatBubble';
import { EmptyState } from './EmptyState';
import {
  QuickSuggestions,
  type QuickSuggestion,
} from './QuickSuggestions';
import {
  AppColors,
  FontWeight,
  Radius,
  Spacing,
} from '../../constants/theme';
import { useNativeDriver } from '../../utils/animation';

interface NegotiationChatSheetProps {
  visible: boolean;
  bookingId: string;
  providerName?: string;
  currentStatus?: string;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  text: string;
  senderType: ChatSenderType;
  senderId: string;
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'failed', 'rejected']);

export default function NegotiationChatSheet({
  visible,
  bookingId,
  providerName,
  currentStatus,
  onClose,
}: NegotiationChatSheetProps) {
  // Real signed-in UID. The send handler will refuse to fire when this is null.
  const currentUserId = auth?.currentUser?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ─── Sheet open / close animation ───────────────────────────────────────

  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver,
    }).start();
  }, [visible, sheetAnim]);

  // ─── 1. Real-time messages subcollection listener ───────────────────────

  useEffect(() => {
    if (!visible || !bookingId || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const messagesRef = collection(db, 'bookings', bookingId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));

    let active = true;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const next: ChatMessage[] = [];
        snapshot.forEach((messageDoc) => {
          const data = messageDoc.data();
          next.push({
            id: messageDoc.id,
            text: data.text || '',
            senderType: (data.senderType || 'system') as ChatSenderType,
            senderId: data.senderId || '',
          });
        });
        setMessages(next);
        setLoading(false);
      },
      (error) => {
        console.warn('[NegotiationChatSheet] snapshot error:', {
          code: error?.code,
          message: error?.message,
          bookingId,
        });
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bookingId, visible]);

  // ─── 2. Auto-scroll to newest message on insert ─────────────────────────

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [messages.length]);

  // ─── 3. Quick suggestions ──────────────────────────────────────────────

  const suggestions: QuickSuggestion[] = [
    { label: 'Request ETA', text: 'Could you share your ETA?' },
    { label: 'Confirm timing', text: 'Please confirm the agreed timing.' },
  ];

  // ─── 4. Send message handler ────────────────────────────────────────────

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || !bookingId || !db || sending) return;

    if (!currentUserId) {
      setSendError('You must be signed in to send messages.');
      return;
    }

    setSending(true);
    setSendError(null);
    if (overrideText === undefined) {
      setDraft('');
    }

    try {
      await apiSendChatMessage(bookingId, currentUserId, text, 'customer');
      Keyboard.dismiss();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not send your message. Please try again.';
      setSendError(message);
      if (overrideText === undefined) {
        setDraft(text);
      }
    } finally {
      setSending(false);
    }
  };

  // ─── 5. Render ──────────────────────────────────────────────────────────

  const chatClosed = currentStatus
    ? CLOSED_STATUSES.has(currentStatus)
    : false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={styles.backdropTouch}>
          {({ pressed }) => <View style={[styles.backdropTouch, pressed && { opacity: 0 }]} />}
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: sheetAnim,
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [420, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <SafeAreaView edges={['bottom']} style={styles.flex}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.flex}
              keyboardVerticalOffset={0}
            >
              <View style={styles.handle} />

              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={styles.title}>Live negotiation</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {providerName || 'Provider'} ·{' '}
                    {(currentStatus || 'pending').replace(/_/g, ' ')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close chat"
                >
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              {chatClosed ? (
                <View style={styles.closedBanner}>
                  <Text style={styles.closedText}>
                    Booking {currentStatus} — chat closed.
                  </Text>
                </View>
              ) : (
                <QuickSuggestions
                  suggestions={suggestions}
                  onPick={(t) => {
                    setSendError(null);
                    void sendMessage(t);
                  }}
                />
              )}

              <View style={styles.body}>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={AppColors.primary} />
                    <Text style={styles.loadingText}>Loading chat…</Text>
                  </View>
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon="💬"
                    title="No messages yet"
                    body="Send the first message to start negotiating with your provider."
                  />
                ) : (
                  <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <ChatBubble
                        text={item.text}
                        isMe={item.senderType === 'customer'}
                        avatarLabel={providerName ?? 'P'}
                        senderType={item.senderType}
                      />
                    )}
                    inverted
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.messages}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </View>

              {sendError ? (
                <Text style={styles.errorText} numberOfLines={2}>
                  {sendError}
                </Text>
              ) : null}

              {!chatClosed ? (
                <View style={styles.composer}>
                  <View style={styles.inputShell}>
                    <TextInput
                      style={styles.input}
                      placeholder={
                        currentUserId
                          ? 'Send a message or counter-offer'
                          : 'Sign in to send a message'
                      }
                      placeholderTextColor={AppColors.textMuted}
                      value={draft}
                      onChangeText={(t) => {
                        setDraft(t);
                        if (sendError) setSendError(null);
                      }}
                      editable={!sending && Boolean(currentUserId)}
                      multiline
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      (sending || !currentUserId || !draft.trim()) &&
                        styles.sendBtnDisabled,
                    ]}
                    onPress={() => void sendMessage()}
                    disabled={
                      sending || !currentUserId || draft.trim().length === 0
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                  >
                    {sending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.sendText}>➤</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
  },
  backdropTouch: { flex: 1 },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: AppColors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: AppColors.border,
    maxHeight: '82%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: AppColors.overlay,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
    gap: Spacing.three,
  },
  headerText: { flex: 1 },
  title: {
    color: AppColors.textPrimary,
    fontSize: 17,
    fontWeight: FontWeight.extrabold as '800',
  },
  subtitle: {
    color: AppColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: FontWeight.bold as '700',
  },
  body: { flex: 1, marginTop: Spacing.two },
  messages: { paddingBottom: Spacing.three },
  loadingRow: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: AppColors.textMuted,
    fontSize: 13,
    marginTop: Spacing.two,
  },
  closedBanner: {
    backgroundColor: AppColors.surface,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: Spacing.two,
    alignItems: 'center',
  },
  closedText: {
    color: AppColors.textMuted,
    fontSize: 13,
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 12,
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  inputShell: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 42,
    justifyContent: 'center',
  },
  input: {
    color: AppColors.textPrimary,
    fontSize: 14,
    maxHeight: 88,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: '#fff', fontSize: 18, fontWeight: FontWeight.extrabold as '800' },
});
