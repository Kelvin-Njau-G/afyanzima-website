'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';

import { pharmacies, type Pharmacy } from '@/app/data';

function PharmacyMarker({ pharmacy }: { pharmacy: Pharmacy }) {
  const [infowindowOpen, setInfowindowOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // clicking the marker will toggle the infowindow
  const handleMarkerClick = useCallback(() => setInfowindowOpen((isShown) => !isShown), []);

  // if the maps api closes the infowindow, we have to synchronize our state
  const handleClose = useCallback(() => setInfowindowOpen(false), []);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: pharmacy.lat, lng: pharmacy.lng }}
        title={pharmacy.name}
        onClick={handleMarkerClick}
      >
        <Pin background="#E63323" borderColor="#E63323" glyphColor="#FFFFFF" />
      </AdvancedMarker>
      {infowindowOpen && (
        <InfoWindow anchor={marker} maxWidth={400} onClose={handleClose}>
          <div className="space-y-1 text-[#111827]">
            <p className="text-base font-bold text-[#006CB5]">{pharmacy.name}</p>
            <p className="text-sm">{pharmacy.location}</p>
            <a href={pharmacy.directions} target="_blank" rel="noopener" className="text-sm font-bold underline">
              Get directions
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

/** Zooms the map so every pharmacy pin is in view, including ones outside Nairobi. */
function FitToPharmacies() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    pharmacies.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
  }, [map]);

  return null;
}

export default function Maps() {
  return (
    <APIProvider apiKey="AIzaSyBXAlLJvUaeq1PlaDVI5Yr_VP1WNimeh60">
      <div className="h-96">
        <Map
          defaultZoom={10}
          defaultCenter={{ lat: -1.23, lng: 36.95 }}
          mapId="AFYANZIMA_MAP_ID"
        >
          <FitToPharmacies />
          {pharmacies.map((pharmacy) => (
            <PharmacyMarker key={pharmacy.key} pharmacy={pharmacy} />
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}
