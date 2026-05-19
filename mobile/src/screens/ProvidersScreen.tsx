import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { findProviders, bookService } from '../services/api';

export default function ProvidersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { intentResult, bookingId } = route.params || {};

  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingLoadingId, setBookingLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        // Pass intentResult.intent because the backend expects the IntentOutput schema
        const intentPayload = intentResult.intent || intentResult;
        const data = await findProviders(bookingId, intentPayload);
        
        // Use ranked providers if available, otherwise fallback to flat providers list
        if (data?.ranked && data.ranked.length > 0) {
          setProviders(data.ranked.map((r: any) => ({ ...r.provider, score_reason: r.score_reason })));
        } else {
          setProviders(data?.providers || data || []);
        }
      } catch (error: any) {
        setErrorMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    if (bookingId && intentResult) {
      fetchProviders();
    } else {
      setErrorMessage('Missing booking details.');
      setIsLoading(false);
    }
  }, [bookingId, intentResult]);

  const handleBookNow = async (provider: any) => {
    const provId = provider.provider_id || provider.id;
    setBookingLoadingId(provId);
    setErrorMessage(null);
    try {
      const intentPayload = intentResult.intent || intentResult;
      const confirmation = await bookService(bookingId, provId, intentPayload);
      navigation.reset({
        index: 0,
        routes: [{ 
          name: 'BookingSuccess', 
          params: { 
            confirmation: confirmation?.booking?.booking_id ? confirmation : { 
              provider_name: provider.name, 
              service_type: intentPayload.service_type, 
              scheduled_time: 'As soon as possible', 
              estimated_price: provider.hourly_rate || provider.estimated_price, 
              booking_id: bookingId 
            } 
          } 
        }],
      });
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to book service.');
      setBookingLoadingId(null);
    }
  };

  const renderProvider = ({ item }: { item: any }) => (
    <View className="bg-slate-800 rounded-2xl p-4 border border-slate-700 mb-4">
      <View className="flex-row justify-between items-start mb-2">
        <View>
          <Text className="text-white text-lg font-bold">{item.name || 'Provider Name'}</Text>
          <Text className="text-slate-400 text-sm capitalize">{item.service || item.service_type || intentResult?.intent?.service_type || 'Service'}</Text>
        </View>
        <View className="bg-slate-900 px-2 py-1 rounded-lg flex-row items-center">
          <Text className="text-yellow-400 font-bold mr-1">★</Text>
          <Text className="text-white text-sm">{item.rating || '4.5'}</Text>
        </View>
      </View>
      
      {item.score_reason && (
        <Text className="text-indigo-300 text-xs italic mb-2">{item.score_reason}</Text>
      )}
      
      <View className="flex-row gap-4 mb-4 mt-2">
        <View>
          <Text className="text-slate-500 text-xs">Distance</Text>
          <Text className="text-slate-300 text-sm font-semibold">{item.distance_km ? `${item.distance_km.toFixed(1)} km` : 'N/A'}</Text>
        </View>
        <View>
          <Text className="text-slate-500 text-xs">Rate</Text>
          <Text className="text-slate-300 text-sm font-semibold">{item.hourly_rate ? `Rs. ${item.hourly_rate}/hr` : 'N/A'}</Text>
        </View>
      </View>

      <TouchableOpacity 
        className={`w-full rounded-xl py-3 flex-row justify-center items-center ${bookingLoadingId === (item.provider_id || item.id) ? 'bg-indigo-600/50' : 'bg-indigo-600'}`}
        onPress={() => handleBookNow(item)}
        disabled={bookingLoadingId !== null}
      >
        {bookingLoadingId === (item.provider_id || item.id) ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text className="text-white font-bold text-sm">Book Now</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-900">
      {errorMessage && (
        <View className="m-4 bg-red-500/10 rounded-2xl p-4 border border-red-500/30">
          <Text className="text-red-400 text-xs font-mono mb-2">ERROR</Text>
          <Text className="text-red-300 text-sm">{errorMessage}</Text>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator color="#6366f1" size="large" />
          <Text className="text-slate-400 mt-4">Finding the best providers...</Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderProvider}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View className="items-center py-10">
              <Text className="text-slate-400 text-base">No providers found for this service.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
