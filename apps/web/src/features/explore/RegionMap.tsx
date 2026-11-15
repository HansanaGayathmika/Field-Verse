import { Fragment, useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Region } from '@fieldverse/contracts';

function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.wrap().lng) });
  return null;
}

/** Fly to a newly chosen point (current location, typed coordinates or a demo region). */
function FlyTo({ target }: { target: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const zoom = Math.max(map.getZoom(), target.zoom);
    map.flyTo([target.lat, target.lon], zoom, { duration: 0.8 });
  }, [map, target?.lat, target?.lon, target?.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Leaflet map with OpenStreetMap tiles (attribution required by the OSM tile policy;
 * the public tile server is for light, interactive use only — see docs/DATA_SOURCES.md).
 * Any point on Earth can be marked.
 */
export default function RegionMap({
  regions,
  selectedId,
  custom,
  onSelect,
  onPick,
}: {
  regions: Region[];
  selectedId: string | null;
  custom: { lat: number; lon: number; source?: string } | null;
  onSelect: (id: string) => void;
  onPick: (lat: number, lon: number) => void;
}) {
  const selected = regions.find((r) => r.id === selectedId);
  const target = custom
    ? { lat: custom.lat, lon: custom.lon, zoom: custom.source === 'map' ? 0 : 9 }
    : selected
      ? { lat: selected.latitude, lon: selected.longitude, zoom: 6 }
      : null;
  return (
    <MapContainer center={[10, 20]} zoom={2} minZoom={2} maxZoom={17} worldCopyJump className="size-full" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={17} />
      <ClickHandler onPick={onPick} />
      <FlyTo target={target} />
      {regions.map((r) => {
        const sel = r.id === selectedId;
        return (
          <Fragment key={r.id}>
            <Circle center={[r.latitude, r.longitude]} radius={r.supportRadiusKm * 1000} pathOptions={{ color: '#16805D', weight: 1, fillOpacity: sel ? 0.15 : 0.06 }} />
            <CircleMarker
              center={[r.latitude, r.longitude]}
              radius={sel ? 13 : 10}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: sel ? '#D6AC60' : '#16805D', fillOpacity: 1 }}
              eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); onSelect(r.id); } }}
              bubblingMouseEvents={false}
            >
              <Tooltip direction="top" offset={[0, -10]} permanent={sel}>
                {r.shortName}, {r.country}
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
      {custom ? (
        <CircleMarker center={[custom.lat, custom.lon]} radius={11} pathOptions={{ color: '#ffffff', weight: 4, fillColor: '#B42318', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -12]} permanent>
            Your farm
          </Tooltip>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
