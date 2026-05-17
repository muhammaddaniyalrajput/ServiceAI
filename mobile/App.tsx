import './global.css'; // NativeWind v4 — must be first import
import React from 'react';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
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
