import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default leaflet icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Auto-zoom to fit all data points on the map
const AutoFitBounds = ({ data }: { data: any[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (data.length === 0) return;
    const bounds = L.latLngBounds(data.map(p => [p.lat, p.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true, duration: 1.2 });
  }, [data, map]);

  return null;
};

interface SpatialMapVisualProps {
  isActive: boolean;
  externalData?: any[];
}

const SpatialMapVisual: React.FC<SpatialMapVisualProps> = ({ isActive, externalData }) => {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (externalData !== undefined) {
      setData(externalData);
      return;
    }
    if (isActive) {
      fetch('http://localhost:8000/api/data/spatial')
        .then(res => res.json())
        .then(resData => setData(resData))
        .catch(err => console.error(err));
    }
  }, [isActive, externalData]);

  if (!isActive) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
        Map Engine Offline. Connect to database to render spatial data.
      </div>
    );
  }

  return (
    <MapContainer 
      center={[20, 0]} 
      zoom={2} 
      style={{ height: '100%', width: '100%', background: '#0b0f19' }}
      zoomControl={false}
    >
      {/* Dark map tiles for premium aesthetic */}
      <TileLayer
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* Auto-zoom to data points */}
      <AutoFitBounds data={data} />
      
      {data.map((point) => (
        <React.Fragment key={point.id}>
          {/* Animated Glow Circle */}
          <CircleMarker 
            center={[point.lat, point.lng]}
            radius={8}
            pathOptions={{ 
              color: 'var(--accent)', 
              fillColor: 'var(--accent-hover)', 
              fillOpacity: 0.8,
              weight: 2 
            }}
          >
            <Popup className="glass-popup">
              <div style={{ color: '#fff' }}>
                <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--accent-hover)' }}>{point.title}</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Lat: {point.lat}<br/>Lng: {point.lng}</span>
              </div>
            </Popup>
          </CircleMarker>
          
          {/* Pulse effect */}
          <CircleMarker 
            center={[point.lat, point.lng]}
            radius={20}
            pathOptions={{ 
              color: 'transparent', 
              fillColor: 'var(--accent)', 
              fillOpacity: 0.2,
            }}
          />
        </React.Fragment>
      ))}
    </MapContainer>
  );
};

export default SpatialMapVisual;
