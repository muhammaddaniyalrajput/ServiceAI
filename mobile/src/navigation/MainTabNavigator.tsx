/**
 * MainTabNavigator — Bottom tab bar wrapping Home, Booking History, Profile.
 *
 * Design: dark surface tabs with indigo active indicator, custom icon set.
 * No external icon library needed — uses emoji/unicode symbols as icons
 * to avoid any native linking requirements.
 */
import React from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types/navigation';

import HomeScreen           from '../screens/HomeScreen';
import BookingHistoryScreen from '../screens/BookingHistoryScreen';
import ProfileScreen        from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

// ─── Custom tab icon component ─────────────────────────────────────────────────

interface TabIconProps {
  emoji: string;
  focused: boolean;
  label: string;
}

const TabIcon: React.FC<TabIconProps> = ({ emoji, focused, label }) => (
  <View style={[tabStyles.iconWrapper, focused && tabStyles.iconWrapperActive]}>
    <Text style={[tabStyles.emoji, focused && tabStyles.emojiActive]}>{emoji}</Text>
  </View>
);

const tabStyles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 48,
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  emoji: {
    fontSize: 22,
    opacity: 0.5,
  },
  emojiActive: {
    opacity: 1,
  },
});

// ─── Navigator ────────────────────────────────────────────────────────────────

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle:     { backgroundColor: '#1e293b' },
        headerTintColor: '#f1f5f9',
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopWidth: 1,
          borderTopColor: 'rgba(51,65,85,0.7)',
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarActiveTintColor:   '#818cf8',
        tabBarInactiveTintColor: '#475569',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title:       'KaamEasy AI',
          tabBarLabel: 'Home',
          tabBarIcon:  ({ focused }) => <TabIcon emoji="🏠" focused={focused} label="Home" />,
        }}
      />
      <Tab.Screen
        name="BookingHistory"
        component={BookingHistoryScreen}
        options={{
          title:       'My Bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon:  ({ focused }) => <TabIcon emoji="📋" focused={focused} label="Bookings" />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title:       'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon:  ({ focused }) => <TabIcon emoji="👤" focused={focused} label="Profile" />,
        }}
      />
    </Tab.Navigator>
  );
}
