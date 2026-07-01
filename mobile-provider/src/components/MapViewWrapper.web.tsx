import React from 'react';
import { View, Text } from 'react-native';

export const Marker = ({ children }: any) => <View>{children}</View>;
export const Polyline = () => null;
export const PROVIDER_GOOGLE = 'google';

const MapViewWrapper = React.forwardRef<any, any>(({ style }, ref) => (
  <View
    ref={ref}
    style={[
      style,
      {
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        borderRadius: 14,
        minHeight: 280,
      },
    ]}
  >
    <Text style={{ color: '#00bfff', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
      🗺️ Live Map Tracking
    </Text>
    <Text style={{ color: '#aaa', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
      Map visualization is only available on native iOS/Android devices.
    </Text>
    <Text style={{ color: '#666', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
      Please run the app in an emulator or scan the QR code with your phone.
    </Text>
  </View>
));

MapViewWrapper.displayName = 'MapView';
export default MapViewWrapper;
