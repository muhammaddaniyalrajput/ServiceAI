/**
 * MapViewWrapper — web fallback.
 *
 * `react-native-maps` doesn't render in a browser, so on web we render
 * a visual placeholder (a styled `<View>` with a "map is only available
 * on native" notice) and expose a no-op ref that implements the same
 * imperative API the native `MapView` does.
 *
 * The key part: `useImperativeHandle` defines the ref shape explicitly
 * — so consumers that call `mapRef.current.fitToCoordinates(...)` /
 * `mapRef.current.animateCamera(...)` etc. never see `undefined` /
 * `is not a function` and never crash on web.
 */
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text } from 'react-native';

// Public re-exports kept compatible with the native wrapper.
export const Marker = ({ children }: any) => <View>{children}</View>;
export const PROVIDER_GOOGLE = 'google';

/**
 * The subset of the `react-native-maps` imperative API we actually
 * call from screens. Every method is a safe no-op on web so screens
 * can run identical code on both platforms.
 */
export interface WebMapRef {
  fitToCoordinates: (
    coords: Array<{ latitude: number; longitude: number }>,
    options?: {
      edgePadding?: { top?: number; right?: number; bottom?: number; left?: number };
      animated?: boolean;
    },
  ) => void;
  animateToRegion: (region: any, duration?: number) => void;
  animateCamera: (camera: any, duration?: number) => void;
  setRegion: (region: any) => void;
}

const MapViewWrapper = forwardRef<WebMapRef, any>((props, ref) => {
  const { style } = props;
  const innerRef = useRef<View>(null);

  useImperativeHandle(
    ref,
    (): WebMapRef => ({
      fitToCoordinates: (_coords, _options) => {
        /* web stub */
      },
      animateToRegion: (_region, _duration) => {
        /* web stub */
      },
      animateCamera: (_camera, _duration) => {
        /* web stub */
      },
      setRegion: (_region) => {
        /* web stub */
      },
    }),
    [],
  );

  return (
    <View
      ref={innerRef}
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
  );
});

MapViewWrapper.displayName = 'MapView';
export default MapViewWrapper;
