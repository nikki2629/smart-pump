import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors } from '@/ui/components';

const icons: Record<string, string> = {
  index: '⌂',
  pumps: '◉',
  commands: '↔',
  alerts: '△',
  profile: '○',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 66,
          paddingTop: 7,
          paddingBottom: 8,
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 20 }}>{icons[route.name] ?? '•'}</Text>
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="pumps" options={{ title: 'Pumps' }} />
      <Tabs.Screen name="commands" options={{ title: 'Commands' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
