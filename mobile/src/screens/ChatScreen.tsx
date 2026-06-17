import React, { useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { sendChatMessage } from '../services/api';

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: string;
}

export default function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { bookingId, providerName } = route.params || {};

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
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
          // Auto-navigate to live tracking when provider confirms
          setTimeout(() => {
            navigation.replace('LiveTracking', {
              bookingId,
              providerName: providerName || data.provider?.name,
              providerCoordinates: data.provider_live_coordinates || data.provider,
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
      await sendChatMessage(bookingId, 'user', text);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender === 'user';
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgWrapperMe : styles.msgWrapperThem]}>
        {!isMe && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{providerName ? providerName[0] : 'P'}</Text>
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Negotiate Timing</Text>
          <Text style={styles.headerSub}>
            {isConfirmed ? 'Booking Confirmed!' : `Chatting with ${providerName || 'Provider'}`}
          </Text>
        </View>
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
          <Text style={styles.confirmedText}>Redirecting to Live Tracking...</Text>
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
  headerTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  
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
});
