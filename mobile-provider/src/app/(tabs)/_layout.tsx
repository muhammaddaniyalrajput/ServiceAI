/**
 * Bottom Tabs Layout — Provider app.
 *
 * 4 tabs in this order:
 *   👉 [ Dashboard | Jobs | Chat | Profile ]
 *
 * The `Dashboard` screen is mounted as the *index* of this group
 * (``/(tabs)/index.tsx``) so the tab bar still works when the
 * provider first opens the app.
 *
 * The modal-style screens (`job-detail`, `live-tracking`, `chat`,
 * `earnings`, `job-history`) live at the **root** Stack level
 * (see `../_layout.tsx`) so they cover the tab bar instead of
 * pushing it down.
 */
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontWeight, Spacing } from '@/constants/theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View
      style={[
        tabStyles.iconWrapper,
        focused && tabStyles.iconWrapperActive,
      ]}
    >
      <Text style={[tabStyles.emoji, focused && tabStyles.emojiActive]}>
        {emoji}
      </Text>
    </View>
  );
}

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
    backgroundColor: 'rgba(0, 191, 255, 0.18)',
  },
  emoji: {
    fontSize: 22,
    opacity: 0.55,
  },
  emojiActive: {
    opacity: 1,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: AppColors.surface },
        headerTintColor: AppColors.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        tabBarStyle: {
          backgroundColor: AppColors.bg,
          borderTopWidth: 1,
          borderTopColor: AppColors.border,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FontWeight.bold as '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarActiveTintColor: AppColors.primary,
        tabBarInactiveTintColor: AppColors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarLabel: 'Jobs',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📋" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat-inbox"
        options={{
          title: 'Messages',
          tabBarLabel: 'Chat',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="💬" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
