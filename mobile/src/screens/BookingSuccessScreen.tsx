import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function BookingSuccessScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { confirmation } = route.params || {};

  const handleBackToHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  return (
    <View className="flex-1 bg-slate-900 justify-center items-center px-6">
      <View className="w-24 h-24 bg-green-500/20 rounded-full justify-center items-center mb-6">
        <Text className="text-5xl">✅</Text>
      </View>
      
      <Text className="text-white text-3xl font-bold mb-2 text-center">Booking Confirmed!</Text>
      <Text className="text-slate-400 text-base text-center mb-10">
        Your service professional has been notified and is on the way.
      </Text>

      <View className="w-full bg-slate-800 rounded-2xl p-5 border border-slate-700 mb-10">
        <Text className="text-slate-500 text-xs font-mono mb-4 text-center">BOOKING DETAILS</Text>
        
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-400">Provider</Text>
          <Text className="text-white font-semibold">{confirmation?.provider_name || 'N/A'}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-400">Service</Text>
          <Text className="text-white font-semibold capitalize">{confirmation?.service_type || 'N/A'}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-400">Time</Text>
          <Text className="text-white font-semibold">{confirmation?.scheduled_time || 'N/A'}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-slate-400">Est. Price</Text>
          <Text className="text-white font-semibold">{confirmation?.estimated_price || 'N/A'}</Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-slate-700">
          <Text className="text-slate-400">Booking ID</Text>
          <Text className="text-indigo-400 font-mono text-xs">{confirmation?.booking_id || 'N/A'}</Text>
        </View>
      </View>

      <TouchableOpacity 
        className="w-full bg-indigo-600 rounded-2xl py-4 items-center"
        onPress={handleBackToHome}
      >
        <Text className="text-white font-bold text-base">Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}
