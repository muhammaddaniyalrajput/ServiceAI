import './global.css'; // NativeWind v4 — must be first import
import React from 'react';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import ProvidersScreen from './src/screens/ProvidersScreen';
import BookingSuccessScreen from './src/screens/BookingSuccessScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1e293b' },
          headerTintColor: '#fff',
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'ServiceFlow AI' }} 
        />
        <Stack.Screen 
          name="Providers" 
          component={ProvidersScreen} 
          options={{ title: 'Available Providers' }} 
        />
        <Stack.Screen 
          name="BookingSuccess" 
          component={BookingSuccessScreen} 
          options={{ title: 'Booking Confirmed 🎉', headerBackVisible: false }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
