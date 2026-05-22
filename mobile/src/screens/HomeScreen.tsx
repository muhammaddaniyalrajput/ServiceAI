import React, { useState } from 'react';

import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { analyzeRequest } from '../services/api';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [intentResult, setIntentResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    setIsLoading(true);
    setErrorMessage(null);
    setIntentResult(null);

    try {
      const data = await analyzeRequest('anonymous', inputText);
      console.log('Analysis result:', data);
      setIntentResult(data);
    } catch (error: any) {
      console.error('API Error:', error);
      setErrorMessage(error.message || 'Failed to process request. Please try again.');
    } finally {
      setIsLoading(false);
      setInputText('');
    }
  };

  const formatConfidence = (value: any) => {
    if (typeof value !== 'number') return 'N/A';
    // Assume scale is 0-1, multiply by 100. If already 0-100, use as is.
    const percentage = value <= 1 ? value * 100 : value;
    return `${Math.round(percentage)}%`;
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-slate-900" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="px-4 pt-6 pb-3 border-b border-slate-700">
        <Text className="text-indigo-400 text-xs font-semibold tracking-widest uppercase mb-1">Powered by Gemini + Antigravity</Text>
        <Text className="text-white text-2xl font-bold">ServiceFlow AI</Text>
        <Text className="text-slate-400 text-sm mt-1">Describe your service need in any language</Text>
      </View>
      
      <ScrollView className="flex-1 px-4 pt-4">
        {isLoading ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#6366f1" size="large" />
            <Text className="text-slate-400 mt-3 text-sm">Agents are working...</Text>
          </View>
        ) : errorMessage ? (
          <View className="bg-red-500/10 rounded-2xl p-4 border border-red-500/30">
            <Text className="text-red-400 text-xs font-mono mb-2">ERROR</Text>
            <Text className="text-red-300 text-sm">{errorMessage}</Text>
          </View>
        ) : intentResult ? (
          <View className="mb-6">
            <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700 mb-4">
              <Text className="text-slate-500 text-xs font-mono mb-4">WORKFLOW LOG</Text>
              
              <View className="flex-col">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-400 text-sm">🔧 Service</Text>
                  <Text className="text-white text-sm font-semibold capitalize">{intentResult.intent?.service_type || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-400 text-sm">📍 Location</Text>
                  <Text className="text-white text-sm font-semibold capitalize">{intentResult.intent?.location || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-400 text-sm">⚡ Urgency</Text>
                  <Text className="text-white text-sm font-semibold capitalize">{intentResult.intent?.urgency || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-400 text-sm">🗣️ Language</Text>
                  <Text className="text-white text-sm font-semibold capitalize">{intentResult.intent?.language || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-slate-400 text-sm">✅ Confidence</Text>
                  <Text className="text-indigo-400 text-sm font-bold">{formatConfidence(intentResult.intent?.confidence)}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              className="w-full bg-indigo-600 rounded-2xl py-4 flex-row justify-center items-center"
              onPress={() => navigation.navigate('Providers', { 
                intentResult, 
                bookingId: intentResult.booking_id || `BKG-${Math.floor(Math.random() * 10000)}`
              })}
            >
              <Text className="text-white font-bold text-base">Find Providers →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <Text className="text-slate-500 text-xs font-mono mb-2">WORKFLOW LOG</Text>
            <Text className="text-slate-400 text-sm">Awaiting your request. Type in English, Urdu, or Roman Urdu.</Text>
            <Text className="text-slate-600 text-xs mt-3 italic">Example: "Mujhe kal subah G-13 mein AC technician chahiye"</Text>
          </View>
        )}
      </ScrollView>

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
          className={`rounded-2xl px-5 py-3 ${isLoading ? 'bg-indigo-600/50' : 'bg-indigo-600'}`} 
          onPress={handleSend} 
          disabled={isLoading}
        >
          <Text className="text-white font-bold text-sm">Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}