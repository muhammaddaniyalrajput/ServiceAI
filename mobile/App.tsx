import './global.css'; // NativeWind v4 — must be first import
import React, { useEffect } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from './src/firebase';
import { registerForPushNotificationsAsync } from './src/services/pushNotifications';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    async function setupApp() {
      try {
        await signInAnonymously(auth);
        console.log('Signed in anonymously with Firebase!');

        const fcmToken = await registerForPushNotificationsAsync();
        if (fcmToken) {
          console.log('FCM Token ready to be sent to backend:', fcmToken);
          // TODO: Send fcmToken to backend API if needed
        }
      } catch (error) {
        console.error('Error during Firebase setup:', error);
      }
    }

    setupApp();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'ServiceFlow AI', headerStyle: { backgroundColor: '#1e293b' }, headerTintColor: '#fff' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
