/**
 * ChatInboxScreen — Customer app.
 *
 * Lists every active conversation the current customer is a participant
 * in, sorted by the backend's ``updated_at`` DESC. Tapping a row deep-
 * links to the existing full Chat screen with the ``booking_id`` in the
 * route parameters.
 *
 * Design: matches the customer app's slate dark palette
 * (``#0f172a`` background, ``#1e293b`` surface, indigo ``#6366f1`` accent).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { AppColors, FontWeight, Radius, Spacing } from '../constants/theme';
import { EmptyState } from '../components/ui/EmptyState';
import { getChatInbox, type Conversation } from '../services/api';
import { RootStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ChatInboxScreen() {
  const navigation = useNavigation<Nav>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInbox = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getChatInbox('customer', 'active');
      setConversations(data.conversations ?? []);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not load your chats. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox(false);
  }, [fetchInbox]);

  const handleOpenConversation = useCallback(
    (conv: Conversation) => {
      // Deep-link into the full chat screen with the booking_id.
      // The Chat screen is at the stack level (not in the tab bar).
      navigation.navigate('Chat', {
        bookingId: conv.booking_id,
        providerName: conv.provider_name || 'Provider',
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        role="customer"
        onPress={handleOpenConversation}
      />
    ),
    [handleOpenConversation],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>
          Negotiate and confirm with your service providers.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.centerText}>Loading conversations…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText} numberOfLines={3}>
            {error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchInbox(false)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchInbox(true)}
              tintColor={AppColors.primary}
              colors={[AppColors.primary]}
            />
          }
          ListHeaderComponent={
            conversations.length > 0 ? (
              <Text style={styles.listHeader}>
                {conversations.length} active conversation
                {conversations.length !== 1 ? 's' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="💬"
              title="No conversations yet"
              body="Once a provider accepts your booking, your chat will appear here."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

interface RowProps {
  conversation: Conversation;
  role: 'customer' | 'provider';
  onPress: (conv: Conversation) => void;
}

const ConversationRow: React.FC<RowProps> = ({ conversation, role, onPress }) => {
  // Customer sees the provider's name, provider sees the customer's name.
  const counterpartName =
    role === 'customer'
      ? conversation.provider_name || 'Provider'
      : conversation.customer_name || 'Customer';

  const serviceTag = conversation.service_type || 'Service request';
  const initial = counterpartName.charAt(0).toUpperCase() || '?';

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`Open chat with ${counterpartName}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName} numberOfLines={1}>
            {counterpartName}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1}>
            {formatRelativeTime(conversation.updated_at)}
          </Text>
        </View>

        <View style={styles.serviceTagPill}>
          <Ionicons name="briefcase-outline" size={11} color={AppColors.textMuted} />
          <Text style={styles.serviceTagText} numberOfLines={1}>
            {serviceTag}
          </Text>
        </View>

        <Text style={styles.rowSnippet} numberOfLines={1}>
          {conversation.last_message || 'No messages yet — say hello!'}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={AppColors.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Render a friendly relative-time string from an ISO timestamp.
 * The backend already sends an ``updated_at`` ISO string.
 */
function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';

  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));

  if (diffSec < 60) return 'now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`;

  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    color: AppColors.textPrimary,
    fontSize: 26,
    fontWeight: FontWeight.extrabold as '800',
  },
  subtitle: {
    color: AppColors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
  },
  centerText: { color: AppColors.textMuted, marginTop: Spacing.two, fontSize: 14 },

  errorWrap: {
    margin: Spacing.four,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.30)',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.four,
    alignItems: 'center',
  },
  errorText: { color: AppColors.danger, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.three,
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  retryBtnText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: FontWeight.bold as '700',
  },

  listContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.eight,
  },
  listHeader: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: FontWeight.semibold as '600',
    marginBottom: Spacing.three,
    letterSpacing: 0.5,
  },
  separator: { height: 1, backgroundColor: AppColors.borderSubtle, marginLeft: 72 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: FontWeight.bold as '700',
  },
  rowBody: { flex: 1 },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  rowName: {
    color: AppColors.textPrimary,
    fontSize: 15,
    fontWeight: FontWeight.bold as '700',
    flex: 1,
    marginRight: Spacing.two,
  },
  rowTime: {
    color: AppColors.textMuted,
    fontSize: 11,
  },
  serviceTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: AppColors.surface2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginTop: 2,
    marginBottom: 4,
  },
  serviceTagText: {
    color: AppColors.textMuted,
    fontSize: 10,
    fontWeight: FontWeight.semibold as '600',
    letterSpacing: 0.3,
  },
  rowSnippet: {
    color: AppColors.textSecondary,
    fontSize: 13,
  },
  chevron: {
    marginLeft: Spacing.two,
  },
});
