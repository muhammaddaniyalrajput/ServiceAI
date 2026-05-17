import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

// NativeWind v4: NO 'styled()' import needed.
// className prop works directly on all RN core components
// thanks to the Metro transform in metro.config.js.

export default function HomeScreen() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    // TODO: call /api/v1/analyze-request
    setTimeout(() => setIsLoading(false), 2000);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View className="px-4 pt-6 pb-3 border-b border-slate-700">
        <Text className="text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">
          Powered by Gemini + Antigravity
        </Text>
        <Text className="text-white text-2xl font-bold">
          ServiceFlow AI
        </Text>
        <Text className="text-slate-400 text-sm mt-1">
          Describe your service need in any language
        </Text>
      </View>

      {/* Agent Log Area */}
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 16 }}>
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#6366f1" size="large" />
            <Text className="text-slate-400 mt-3 text-sm">
              Agents are working...
            </Text>
          </View>
        ) : (
          <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <Text className="text-slate-500 text-xs font-mono mb-2">
              WORKFLOW LOG
            </Text>
            <Text className="text-slate-400 text-sm">
              Awaiting your request. Type in English, Urdu, or Roman Urdu.
            </Text>
            <Text className="text-slate-600 text-xs mt-3 italic">
              Example: "Mujhe kal subah G-13 mein AC technician chahiye"
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Input Bar */}
      <View className="flex-row items-end px-4 pb-6 pt-2 border-t border-slate-700 gap-2">
        <TextInput
          className="flex-1 bg-slate-800 text-white rounded-2xl px-4 py-3 text-sm"
          placeholder="Describe your service need..."
          placeholderTextColor="#475569"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          className="bg-indigo-600 rounded-2xl px-5 py-3"
          onPress={handleSend}
          disabled={isLoading}
        >
          <Text className="text-white font-bold text-sm">Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
