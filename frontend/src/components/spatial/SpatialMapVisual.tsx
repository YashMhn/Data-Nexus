import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { SpatialPoint } from '../../types';

// Leaflet writes these straight into SVG presentation attributes, which do not
// resolve CSS custom properties -- var(--accent) silently fell back to the
// default blue. Use literals that match the design tokens.
const MARKER_STROKE = '#6366f1';
const MARKER_FILL = '#818cf8';

/** Fit the viewport to the data. `map` is an external system, so an effect is right here. */
const AutoFitBounds = ({ points }: { points: SpatialPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(
      points.map((point) => [point.lat, point.lng] as L.LatLngTuple),
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [points, map]);

  return null;
};

interface SpatialMapVisualProps {
  points: SpatialPoint[];
  hasDataset: boolean;
  truncated: boolean;
}

const SpatialMapVisual = ({ points, hasDataset, truncated }: SpatialMapVisualProps) => {
  if (!hasDataset) {
    return (
      <div className="chart-placeholder chart-placeholder--muted">
        Upload a dataset to render spatial data.
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="chart-placeholder chart-placeholder--muted">
        No usable lat/lng columns in this dataset.
      </div>
    );
  }

  return (
    <>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%', background: '#0b0f19' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <AutoFitBounds points={points} />
        {points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lng]}
            radius={7}
            pathOptions={{
              color: MARKER_STROKE,
              fillColor: MARKER_FILL,
              fillOpacity: 0.75,
              weight: 2,
            }}
          >
            <Popup className="glass-popup">
              <strong className="map-popup__title">{point.title}</strong>
              <span className="map-popup__coords">
                {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
              </span>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {truncated && (
        <p className="map-note">Showing the first 2,000 points of this dataset.</p>
      )}
    </>
  );
};

export default SpatialMapVisual;
