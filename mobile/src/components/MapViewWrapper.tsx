import React from 'react';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export { Marker, PROVIDER_GOOGLE };

const MapViewWrapper = React.forwardRef<MapView, React.ComponentProps<typeof MapView>>((props, ref) => (
  <MapView ref={ref} {...props} />
));

MapViewWrapper.displayName = 'MapView';
export default MapViewWrapper;
