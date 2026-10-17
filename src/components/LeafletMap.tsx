import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { AlertTriangle, MapPin } from 'lucide-react';

interface LeafletMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  isDraggable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
  accuracyMeters?: number | null;
  isFuzzy?: boolean; // For public track page (~110m circle)
  className?: string;
  markerTitle?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  lat,
  lng,
  zoom = 15,
  isDraggable = false,
  onLocationChange,
  accuracyMeters,
  isFuzzy = false,
  className = 'h-64 w-full rounded-2xl overflow-hidden',
  markerTitle = 'Report Location',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing instance if any
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Initialize Leaflet map
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([lat, lng], zoom);

    mapRef.current = map;

    // OpenStreetMap tile layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Custom SVG DivIcon to prevent broken asset paths
    const pinHtml = isFuzzy
      ? `<div style="background-color: #0284c7; width: 24px; height: 24px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"></div>`
      : `<div style="background-color: #15803d; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
           <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
         </div>`;

    const customIcon = L.divIcon({
      className: 'cleanward-custom-pin',
      html: pinHtml,
      iconSize: isFuzzy ? [24, 24] : [32, 32],
      iconAnchor: isFuzzy ? [12, 12] : [16, 32],
      popupAnchor: [0, -32],
    });

    // Create marker
    const marker = L.marker([lat, lng], {
      icon: customIcon,
      draggable: isDraggable,
      title: markerTitle,
    }).addTo(map);

    markerRef.current = marker;

    if (isDraggable) {
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        if (onLocationChange) {
          onLocationChange(position.lat, position.lng);
        }
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        if (onLocationChange) {
          onLocationChange(e.latlng.lat, e.latlng.lng);
        }
      });
    }

    // If fuzzy tracking, draw an area circle (~100m) to represent privacy zone
    if (isFuzzy) {
      circleRef.current = L.circle([lat, lng], {
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.18,
        radius: 110,
        weight: 1.5,
      }).addTo(map);
    }

    // Invalidate size after mount for proper rendering
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync position updates
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
      }
      mapRef.current.panTo([lat, lng]);
    }
  }, [lat, lng]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} className={className} />

      {/* GPS Accuracy Warning if worse than 50 meters */}
      {accuracyMeters != null && accuracyMeters > 50 && (
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center gap-2 p-2.5 bg-amber-500/95 text-white text-xs font-semibold rounded-xl shadow-md backdrop-blur-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            GPS accuracy is ±{Math.round(accuracyMeters)}m (&gt;50m). You can drag the pin to your exact spot.
          </span>
        </div>
      )}

      {isDraggable && (
        <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-white/90 backdrop-blur-xs text-[11px] font-medium text-slate-700 rounded-lg shadow-sm border border-slate-200">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Drag pin or tap map to adjust</span>
        </div>
      )}
    </div>
  );
};
