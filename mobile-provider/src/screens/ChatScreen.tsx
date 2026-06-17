import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { providerAPI } from '@/services/providerAPI';
import { useSingleJobListener } from '@/hooks/useProviderJobs';

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: string;
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const bookingId = typeof params.booking_id === 'string' ? params.booking_id : '';

  const { job } = useSingleJobListener(bookingId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  
  // Timing negotiation modal
  const [modalVisible, setModalVisible] = useState(false);
  const [proposedTime, setProposedTime] = useState('In 30 minutes');

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!bookingId || !db) return;

    const docRef = doc(db, 'bookings', bookingId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.chat_messages) {
          setMessages(data.chat_messages);
        }
        if (data.status === 'confirmed') {
          setIsConfirmed(true);
          setModalVisible(false);
          // Proactively navigate to live tracking when confirmed
          setTimeout(() => {
            router.replace({
              pathname: '/live-tracking',
              params: { booking_id: bookingId },
            });
          }, 1500);
        }
      }
    });

    return () => unsubscribe();
  }, [bookingId]);

  const sendMessage = async () => {
    if (!inputText.trim() || !bookingId) return;

    const text = inputText.trim();
    setInputText('');

    try {
      await providerAPI.sendChatMessage(bookingId, text);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleConfirmBooking = async () => {
    if (!bookingId) return;
    try {
      await providerAPI.confirmBooking(bookingId, proposedTime);
    } catch (err) {
      console.error('Failed to confirm booking:', err);
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === 'provider';
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgWrapperMe : styles.msgWrapperThem]}>
        {!isMe && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {job?.customer_name ? job.customer_name[0] : 'C'}
            </Text>
          </View>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Negotiate Timing</Text>
          <Text style={styles.headerSub}>
            {isConfirmed ? 'Confirmed!' : `Chatting with ${job?.customer_name || 'Customer'}`}
          </Text>
        </View>
        {!isConfirmed && (
          <TouchableOpacity style={styles.confirmHeaderBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.confirmHeaderBtnText}>Agree & Confirm</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Propose/Confirm Timing Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Agreed Time</Text>
            <Text style={styles.modalSub}>Propose and save the timing you both agreed on in chat.</Text>
            
            <View style={styles.presetsRow}>
              {['In 15 mins', 'In 30 mins', 'In 1 hour', 'Tomorrow'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.presetBtn, proposedTime === t && styles.presetBtnActive]}
                  onPress={() => setProposedTime(t)}
                >
                  <Text style={[styles.presetText, proposedTime === t && styles.presetTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.modalInput}
              value={proposedTime}
              onChangeText={setProposedTime}
              placeholder="Or enter custom time (e.g. 5:00 PM)"
              placeholderTextColor="#64748b"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmBooking}>
                <Text style={styles.modalConfirmText}>Confirm Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Input */}
      {!isConfirmed ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.confirmedBanner}>
          <Text style={styles.confirmedText}>Booking Confirmed! Navigating to Live Tracking...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 15, paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  backBtn: { marginRight: 15, padding: 5 },
  backText: { color: '#e2e8f0', fontSize: 24, fontWeight: '300' },
  headerTitleContainer: { flex: 1 },
  headerTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  confirmHeaderBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8,
  },
  confirmHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  
  listContent: { padding: 16, paddingBottom: 30 },
  msgWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  msgWrapperMe: { justifyContent: 'flex-end' },
  msgWrapperThem: { justifyContent: 'flex-start' },
  
  avatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#1e293b', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#334155' },
  
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextMe: { color: '#ffffff' },
  msgTextThem: { color: '#e2e8f0' },
  
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 12,
    backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155',
  },
  input: {
    flex: 1, backgroundColor: '#0f172a', color: '#e2e8f0',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, borderWidth: 1, borderColor: '#334155',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center', marginLeft: 10,
  },
  sendIcon: { color: '#fff', fontSize: 18 },
  
  confirmedBanner: {
    padding: 20, backgroundColor: '#10b981', alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  confirmedText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSub: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetBtnActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  presetText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  presetTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalInput: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancel: {
    padding: 12,
  },
  modalCancelText: {
    color: '#94a3b8',
    fontSize: 15,
  },
  modalConfirm: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
