import React from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

export { Marker, Polyline, PROVIDER_GOOGLE };

const MapViewWrapper = React.forwardRef<MapView, React.ComponentProps<typeof MapView>>((props, ref) => (
  <MapView ref={ref} {...props} />
));

MapViewWrapper.displayName = 'MapView';
export default MapViewWrapper;
