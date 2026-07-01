import React from 'react';
import { View, Text } from 'react-native';

export const Marker = ({ children }: any) => <View>{children}</View>;
export const PROVIDER_GOOGLE = 'google';

const MapViewWrapper = React.forwardRef<any, any>(({ style }, ref) => (
  <View
    ref={ref}
    style={[
      style,
      {
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        borderRadius: 14,
      },
    ]}
  >
    <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
      🗺️ Live Map Tracking
    </Text>
    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
      Map visualization is only available on native iOS/Android devices.
    </Text>
    <Text style={{ color: '#475569', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
      Please run the app in an emulator or scan the QR code with your phone.
    </Text>
  </View>
));

MapViewWrapper.displayName = 'MapView';
export default MapViewWrapper;
