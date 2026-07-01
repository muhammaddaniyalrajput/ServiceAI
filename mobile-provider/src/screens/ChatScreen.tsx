/**
 * ChatScreen — KaamEasy Provider chat & negotiation screen.
 *
 * Pipeline (Phase 2 fix):
 *   - Send:  POST  /v1/bookings/{id}/chat        →  backend writes to Firestore
 *   - Read:  Firestore onSnapshot  →  real-time render
 *   - The current provider's UID is sourced strictly from `auth.currentUser?.uid`.
 *     If absent, the send button is disabled and an inline error is shown —
 *     the previous behaviour of falling back to a role string ("provider")
 *     silently mis-attributed every message.
 *   - The local `sending` state disables the composer while a POST is in
 *     flight; an inline error message is rendered on failure.
 *
 * UX:
 *   - Inline quick-action chips above the composer (Request location / Prep
 *     update) replace the old `+` action button and separate modal.
 *   - "Agree & Confirm" header button opens a small inline sheet for picking
 *     a time — a single layer instead of the previous action-menu + modal.
 *   - Auto-scroll on new messages; `EmptyState` when no messages exist.
 *   - Wrapped in `SafeAreaView` so content never clips under the notch.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Animated,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useSingleJobListener } from '@/hooks/useProviderJobs';
import { providerAPI } from '@/services/providerAPI';
import {
  AppColors,
  FontWeight,
  Radius,
  Spacing,
} from '@/constants/theme';
import { StatusBadge, type StatusKey } from '@/components/ui/StatusBadge';
import { ChatBubble, type ChatSenderType } from '@/components/ui/ChatBubble';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  QuickSuggestions,
  type QuickSuggestion,
} from '@/components/ui/QuickSuggestions';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ChatMessage {
  _id: string;
  text: string;
  createdAt: number;
  senderId: string;
  senderType: ChatSenderType;
}

interface BookingData {
  status: string;
  providerId?: string;
  customerId?: string;
  scheduled_time?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_coordinates?: { latitude: number; longitude: number };
}

const AUTO_NAVIGATE_STATUSES = new Set(['confirmed', 'on_the_way']);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'failed', 'rejected']);
const PROPOSAL_TIMES = ['In 15 mins', 'In 30 mins', 'In 1 hour', 'Tomorrow'];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking_id?: string }>();
  const bookingId =
    typeof params.booking_id === 'string' ? params.booking_id : '';

  // Real signed-in UID. The send handler will refuse to fire when this is null.
  const currentUserId = auth?.currentUser?.uid ?? null;

  const { job } = useSingleJobListener(bookingId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmingTime, setConfirmingTime] = useState<string | null>(null);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [proposedTime, setProposedTime] = useState<string>('In 30 mins');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const autoNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const customerName = bookingData?.customer_name || job?.customer_name || 'Customer';

  // ─── 1. Real-time parent booking listener ────────────────────────────────

  useEffect(() => {
    if (!bookingId || !db) {
      setLoading(false);
      return;
    }

    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(
      bookingRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as BookingData;
          setBookingData(data);

          if (AUTO_NAVIGATE_STATUSES.has(data.status)) {
            if (autoNavTimerRef.current) {
              clearTimeout(autoNavTimerRef.current);
            }
            autoNavTimerRef.current = setTimeout(() => {
              router.replace({
                pathname: '/live-tracking',
                params: { booking_id: bookingId },
              });
            }, 1500);
          }
        }
        setLoading(false);
      },
      (error) => {
        console.warn('[ProviderChat] booking snapshot error:', {
          code: error?.code,
          message: error?.message,
        });
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (autoNavTimerRef.current) {
        clearTimeout(autoNavTimerRef.current);
        autoNavTimerRef.current = null;
      }
    };
  }, [bookingId, router]);

  // ─── 2. Real-time messages subcollection listener ────────────────────────

  useEffect(() => {
    if (!bookingId || !db) {
      setLoading(false);
      return;
    }

    const messagesRef = collection(db, 'bookings', bookingId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const msgs: ChatMessage[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let ts = Date.now();
          if (data.createdAt) {
            try {
              ts = data.createdAt.toDate
                ? data.createdAt.toDate().getTime()
                : new Date(data.createdAt).getTime();
            } catch {
              ts = Date.now();
            }
          }
          msgs.push({
            _id: docSnap.id,
            text: data.text || '',
            createdAt: ts,
            senderId: data.senderId || '',
            senderType: (data.senderType || 'system') as ChatSenderType,
          });
        });
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.warn('[ProviderChat] messages snapshot error:', {
          code: err?.code,
          message: err?.message,
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [bookingId]);

  // ─── 3. Auto-scroll to newest message on insert ──────────────────────────

  useEffect(() => {
    if (messages.length === 0) return;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [messages.length]);

  // ─── 4. Sheet open / close animation ────────────────────────────────────

  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: timePickerVisible ? 1 : 0,
      duration: timePickerVisible ? 240 : 200,
      useNativeDriver: true,
    }).start();
  }, [timePickerVisible, sheetAnim]);

  // ─── 5. Quick suggestions (replaces the old action menu + modal) ─────────

  const quickSuggestions = useMemoQuickSuggestions(bookingData?.status);

  // ─── 6. Send message handler ─────────────────────────────────────────────

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || !bookingId || !db || sending) return;

    if (!currentUserId) {
      setSendError('You must be signed in to send messages.');
      return;
    }

    setSending(true);
    setSendError(null);
    if (overrideText === undefined) {
      setInputText('');
    }

    try {
      await providerAPI.sendChatMessage(bookingId, text, 'provider');
      Keyboard.dismiss();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not send your message. Please try again.';
      setSendError(message);
      if (overrideText === undefined) {
        setInputText(text);
      }
    } finally {
      setSending(false);
    }
  };

  // ─── 7. Confirm booking handler ──────────────────────────────────────────

  const handleConfirmBooking = async (time: string) => {
    if (!bookingId || !db || confirmingTime) return;
    setConfirmingTime(time);
    setConfirmError(null);

    try {
      await providerAPI.confirmBooking(bookingId, time);
      setTimePickerVisible(false);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not confirm booking. Please try again.';
      setConfirmError(message);
    } finally {
      setConfirmingTime(null);
    }
  };

  // ─── 8. Render ──────────────────────────────────────────────────────────

  if (!bookingId) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.centerText}>No booking specified…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusKey: StatusKey = (bookingData?.status as StatusKey) ?? 'pending_acceptance';
  const chatClosed = bookingData ? CLOSED_STATUSES.has(bookingData.status) : false;
  const canConfirm = bookingData?.status === 'accepted';
  const showComposer = !chatClosed;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={AppColors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {customerName}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Booking #{bookingId.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <StatusBadge status={statusKey} size="sm" />
        {canConfirm ? (
          <TouchableOpacity
            style={styles.confirmHeaderBtn}
            onPress={() => setTimePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Agree and confirm"
          >
            <Text style={styles.confirmHeaderBtnText}>Confirm</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.body}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={AppColors.primary} />
              <Text style={styles.centerText}>Loading chat history…</Text>
            </View>
          ) : messages.length === 0 ? (
            <EmptyState
              icon="💬"
              title="No messages yet"
              body="Reach out to your customer with a quick greeting or share your ETA to start the conversation."
            />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <ChatBubble
                  text={item.text}
                  isMe={item.senderType === 'provider'}
                  avatarLabel={customerName}
                  senderType={item.senderType}
                />
              )}
              contentContainerStyle={styles.listContent}
              inverted
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
            />
          )}
        </View>

        {showComposer ? (
          <View style={styles.composerWrap}>
            <QuickSuggestions
              suggestions={quickSuggestions}
              onPick={(t) => {
                setSendError(null);
                void sendMessage(t);
              }}
            />

            {sendError ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {sendError}
              </Text>
            ) : null}

            <View style={styles.composer}>
              <View style={styles.inputPill}>
                <TextInput
                  style={styles.input}
                  placeholder={
                    currentUserId ? 'Type a message…' : 'Sign in to send a message'
                  }
                  placeholderTextColor={AppColors.textMuted}
                  value={inputText}
                  onChangeText={(t) => {
                    setInputText(t);
                    if (sendError) setSendError(null);
                  }}
                  editable={!sending && Boolean(currentUserId)}
                  multiline
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (sending || !currentUserId || !inputText.trim()) &&
                    styles.sendBtnDisabled,
                ]}
                onPress={() => void sendMessage()}
                disabled={
                  sending || !currentUserId || inputText.trim().length === 0
                }
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.sendIcon}>➤</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedText}>
              Booking {statusKey === 'completed' ? 'completed' : 'closed'} — chat locked.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Inline time-picker sheet (replaces the old action menu + modal) */}
      <Modal
        animationType="none"
        transparent
        visible={timePickerVisible}
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={() => setTimePickerVisible(false)}
          />
          <Animated.View
            style={[
              styles.modalSheet,
              {
                opacity: sheetAnim,
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [200, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Propose arrival time</Text>
            <Text style={styles.modalSub}>
              Pick a preset or type a custom time (e.g. 5:30 PM).
            </Text>

            <View style={styles.presetsRow}>
              {PROPOSAL_TIMES.map((t) => {
                const isLoading = confirmingTime === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.presetBtn,
                      proposedTime === t && styles.presetBtnActive,
                      isLoading && styles.presetBtnDisabled,
                    ]}
                    onPress={() => setProposedTime(t)}
                    disabled={Boolean(confirmingTime)}
                  >
                    {isLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={proposedTime === t ? '#000' : AppColors.textPrimary}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.presetText,
                          proposedTime === t && styles.presetTextActive,
                        ]}
                      >
                        {t}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.modalInput}
              value={proposedTime}
              onChangeText={setProposedTime}
              placeholder="Or enter custom time"
              placeholderTextColor={AppColors.textMuted}
            />

            {confirmError ? (
              <Text style={styles.errorText}>{confirmError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setTimePickerVisible(false);
                  setConfirmError(null);
                }}
                style={styles.modalCancel}
                disabled={Boolean(confirmingTime)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  confirmingTime && styles.modalConfirmDisabled,
                ]}
                onPress={() => void handleConfirmBooking(proposedTime)}
                disabled={Boolean(confirmingTime)}
                accessibilityRole="button"
                accessibilityLabel="Confirm booking"
              >
                {confirmingTime ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useMemoQuickSuggestions(status?: string): QuickSuggestion[] {
  return useMemo<QuickSuggestion[]>(() => {
    const lower = (status || '').toLowerCase();
    if (lower === 'confirmed' || lower === 'on_the_way' || lower === 'arrived') {
      return [
        {
          label: 'Share location',
          text: "Sharing my live location so you can track my arrival.",
        },
        {
          label: 'On my way',
          text: 'I am on my way and will reach shortly.',
        },
        {
          label: 'Have arrived',
          text: 'I have arrived at the location.',
        },
      ];
    }
    return [
      {
        label: 'Request location',
        text: 'Could you please share your exact address or nearby landmarks?',
      },
      {
        label: 'Prep update',
        text: 'I am sorting the required equipment and will start shortly.',
      },
      {
        label: 'Send ETA',
        text: 'I can be there within the next 30 minutes.',
      },
    ];
  }, [status]);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.six },
  centerText: { color: AppColors.textMuted, marginTop: Spacing.two, fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    gap: Spacing.three,
  },
  backBtn: { padding: 4 },
  backText: { color: AppColors.textPrimary, fontSize: 24, fontWeight: '300' },
  headerText: { flex: 1 },
  headerTitle: {
    color: AppColors.textPrimary,
    fontSize: 17,
    fontWeight: FontWeight.bold as '700',
  },
  headerSub: {
    color: AppColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  confirmHeaderBtn: {
    backgroundColor: AppColors.success,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  confirmHeaderBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: FontWeight.bold as '700',
  },

  body: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },

  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    backgroundColor: AppColors.bg,
    paddingTop: Spacing.two,
  },
  errorText: {
    color: AppColors.danger,
    fontSize: 12,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  inputPill: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: Spacing.four,
    paddingVertical: 6,
    minHeight: 42,
    justifyContent: 'center',
  },
  input: {
    color: AppColors.textPrimary,
    fontSize: 15,
    maxHeight: 110,
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
  sendIcon: { color: '#000', fontSize: 18, fontWeight: '700' },

  lockedBanner: {
    backgroundColor: AppColors.surface,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    alignItems: 'center',
  },
  lockedText: {
    color: AppColors.textMuted,
    fontSize: 13,
  },

  // Modal / sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: { ...StyleSheet.absoluteFill },
  modalSheet: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: AppColors.border,
    padding: Spacing.five,
    paddingBottom: Spacing.six,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: AppColors.overlay,
    marginBottom: Spacing.four,
  },
  modalTitle: {
    color: AppColors.textPrimary,
    fontSize: 18,
    fontWeight: FontWeight.bold as '700',
    marginBottom: Spacing.one,
  },
  modalSub: {
    color: AppColors.textMuted,
    fontSize: 13,
    marginBottom: Spacing.four,
    lineHeight: 18,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  presetBtn: {
    backgroundColor: AppColors.surface2,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  presetBtnActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  presetBtnDisabled: { opacity: 0.6 },
  presetText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: FontWeight.semibold as '600',
  },
  presetTextActive: { color: '#000' },
  modalInput: {
    backgroundColor: AppColors.bg,
    color: AppColors.textPrimary,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    fontSize: 15,
    marginBottom: Spacing.four,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.three,
  },
  modalCancel: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  modalCancelText: {
    color: AppColors.textMuted,
    fontSize: 14,
  },
  modalConfirm: {
    backgroundColor: AppColors.success,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.md,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmDisabled: { opacity: 0.6 },
  modalConfirmText: {
    color: '#000',
    fontSize: 14,
    fontWeight: FontWeight.bold as '700',
  },
});
