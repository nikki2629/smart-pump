import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from './components';

export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetInfo();
  if (isConnected !== false && isInternetReachable !== false) return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.text}>
        Offline — showing cached information where available. Commands require a
        network connection.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3D8',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D19D',
  },
  text: { color: colors.amber, fontSize: 12, fontWeight: '700' },
});
