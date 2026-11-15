import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';

/** Small, non-interactive map that confirms the selected field location. */
export default function LocationPreviewMap({ lat, lon }: { lat: number; lon: number }) {
  return (
    <MapContainer
      key={`${lat},${lon}`}
      center={[lat, lon]}
      zoom={12}
      className="size-full"
      dragging={false}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
      attributionControl
    >
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={[lat, lon]} radius={10} pathOptions={{ color: '#ffffff', weight: 4, fillColor: '#B42318', fillOpacity: 1 }} />
    </MapContainer>
  );
}
