/**
 * ChatScreen — KaamEasy AI customer chat & negotiation screen.
 *
 * Pipeline (Phase 2 fix):
 *   - Send:  POST  /v1/bookings/{id}/chat        →  backend writes to Firestore
 *   - Read:  Firestore onSnapshot  →  real-time render
 *   - The current user's UID is sourced strictly from `auth.currentUser?.uid`.
 *     If absent, the send button is disabled and an inline error is shown —
 *     the previous behaviour of falling back to a role string ("customer")
 *     silently mis-attributed every message.
 *   - The local `sending` state disables the composer while a POST is in
 *     flight; an inline error message is rendered on failure (and the typed
 *     text is preserved so the user can retry).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Platform,
  StatusBar,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { sendChatMessage as apiSendChatMessage } from '../services/api';
import { buildTrackingRouteParams } from '../utils/bookingRoutes';
import {
  AppColors,
  Radius,
  Spacing,
  FontWeight,
} from '../constants/theme';
import { StatusBadge, type StatusKey } from '../components/ui/StatusBadge';
import { ChatBubble, type ChatSenderType } from '../components/ui/ChatBubble';
import { EmptyState } from '../components/ui/EmptyState';
import {
  QuickSuggestions,
  type QuickSuggestion,
} from '../components/ui/QuickSuggestions';

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
  total_estimated_cost?: number;
  user_coordinates?: { latitude: number; longitude: number };
  provider?: { name: string };
  provider_live_coordinates?: { latitude: number; longitude: number };
}

const AUTO_NAVIGATE_STATUSES = new Set(['confirmed', 'on_the_way']);
const NEGOTIATION_STATUSES = new Set([
  'pending',
  'pending_acceptance',
  'accepted',
  'searching',
  'ranking',
]);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'failed', 'rejected']);

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const insets = useSafeAreaInsets();

  // Real signed-in UID. The send handler will refuse to fire when this is null.
  const currentUserId = auth?.currentUser?.uid ?? null;

  const { bookingId, providerName } = route.params || {};

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const autoNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Quick suggestions — derived from current booking state ──────────────

  const quickSuggestions = useMemo<QuickSuggestion[]>(() => {
    const baseCost = bookingData?.total_estimated_cost;
    const lowerOffer = baseCost
      ? Math.max(0, Math.round(baseCost * 0.95))
      : null;

    if (lowerOffer !== null) {
      return [
        {
          label: `Rs. ${baseCost}`,
          text: `I'm good with Rs. ${baseCost} if you can confirm the timing.`,
        },
        {
          label: `Rs. ${lowerOffer}`,
          text: `Could we do Rs. ${lowerOffer} for this job?`,
        },
        {
          label: 'Request ETA',
          text: 'Could you share your ETA for arrival?',
        },
      ];
    }
    return [
      {
        label: 'Request ETA',
        text: 'Could you share your ETA for arrival?',
      },
      {
        label: 'Share location',
        text: "I'm sharing my location details here for easier coordination.",
      },
    ];
  }, [bookingData?.total_estimated_cost]);

  // ─── 1. Real-time parent booking listener ────────────────────────────────

  useEffect(() => {
    if (!bookingId || !db) return;

    const bookingRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(
      bookingRef,
      (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data() as BookingData;
        setBookingData(data);

        // Auto-navigate to LiveTracking once confirmed or en route.
        if (AUTO_NAVIGATE_STATUSES.has(data.status)) {
          if (autoNavTimerRef.current) {
            clearTimeout(autoNavTimerRef.current);
          }
          autoNavTimerRef.current = setTimeout(() => {
            navigation.replace(
              'LiveTracking',
              buildTrackingRouteParams({
                bookingId,
                providerName:
                  providerName || data.provider?.name || 'Provider',
                providerCoordinates: data.provider_live_coordinates,
                userCoordinates: data.user_coordinates,
              })
            );
          }, 1500);
        }
      },
      (error) => {
        console.warn('[ChatScreen] booking snapshot error:', error);
      }
    );

    return () => {
      unsubscribe();
      if (autoNavTimerRef.current) {
        clearTimeout(autoNavTimerRef.current);
        autoNavTimerRef.current = null;
      }
    };
  }, [bookingId, navigation, providerName]);

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
        console.warn('[ChatScreen] messages snapshot error:', err);
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

  // ─── 4. Send message handler ─────────────────────────────────────────────

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || !bookingId || !db) return;

    if (!currentUserId) {
      setSendError('You must be signed in to send messages.');
      return;
    }
    if (sending) return;

    setSending(true);
    setSendError(null);
    if (overrideText === undefined) {
      setInputText('');
    }

    try {
      await apiSendChatMessage(bookingId, text, 'customer');
      Keyboard.dismiss();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not send your message. Please try again.';
      setSendError(message);
      // Restore text so the user can retry without re-typing.
      if (overrideText === undefined) {
        setInputText(text);
      }
    } finally {
      setSending(false);
    }
  };

  // ─── 5. Render ──────────────────────────────────────────────────────────

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

  const statusKey: StatusKey = (bookingData?.status as StatusKey) ?? 'pending';
  const chatClosed = bookingData
    ? CLOSED_STATUSES.has(bookingData.status)
    : false;
  const showComposer = !chatClosed;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={AppColors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {providerName || 'Negotiate Service'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            Booking #{bookingId.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <StatusBadge status={statusKey} size="sm" />
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
              title="Start the conversation"
              body="Negotiate timing and price with your provider here. Their replies will appear in real time."
            />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <ChatBubble
                  text={item.text}
                  isMe={item.senderType === 'customer'}
                  avatarLabel={providerName ?? 'P'}
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

        {/* Composer */}
        {showComposer ? (
          <View style={styles.composerWrap}>
            {quickSuggestions.length > 0 ? (
              <QuickSuggestions
                suggestions={quickSuggestions}
                onPick={(t) => {
                  setSendError(null);
                  void sendMessage(t);
                }}
              />
            ) : null}

            {sendError ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {sendError}
              </Text>
            ) : null}

            <View
              style={[
                styles.composer,
                { paddingBottom: insets.bottom > 0 ? Spacing.two : Spacing.two },
              ]}
            >
              <View style={styles.inputPill}>
                <TextInput
                  style={styles.input}
                  placeholder={
                    currentUserId
                      ? 'Type a message or make a counter-offer…'
                      : 'Sign in to send a message'
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
                  (sending || !currentUserId || inputText.trim().length === 0) &&
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
                  <ActivityIndicator color="#fff" size="small" />
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
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
  },
  centerText: {
    color: AppColors.textMuted,
    marginTop: Spacing.two,
    fontSize: 14,
  },

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
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

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
});
