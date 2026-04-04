'use client';

import { useCallback, useState } from 'react';
import { AdvancedMarker, APIProvider, InfoWindow, Map, Pin, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';

type Poi = { key: string; location: google.maps.LatLngLiteral; title: string };

const pois: Poi[] = [
  { key: 'aurora', location: { lat: -1.3626012775627543, lng: 36.6567066 }, title: 'Aurora Healthcare Limited' },
  { key: 'zackii', location: { lat: -1.25491184849562, lng: 36.722192771164494 }, title: 'Zackii Medical Centre' },
  { key: 'provide', location: { lat: -1.2503942955470304, lng: 36.8741823711645 }, title: 'Provide Medical Centre' },
  {
    key: 'precious',
    location: { lat: -1.26610244946374, lng: 36.98837741534201 },
    title: 'Precious Life Medical Centre',
  },
  {
    key: 'malaika',
    location: { lat: -1.2837067510041174, lng: 36.7529 },
    title: 'Malaika Healthcare Limited',
  },
  {
    key: 'wellLiving',
    location: { lat: -1.2638497181444144, lng: 36.926983666913614 },
    title: 'Well Living Medical Clinic',
  },
  { key: 'nimoli', location: { lat: -1.229291893580319, lng: 36.920567542328996 }, title: 'Nimoli Medical Services' },
  {
    key: 'zackiiMuthua',
    location: { lat: -1.2685477020873601, lng: 36.71829247116448 },
    title: 'Zackii Medical Clinic, Muthua',
  },
  {
    key: 'keyLife',
    location: { lat: 0.07184902558, lng: 37.68580681 },
    title: 'Key Life Medical Centre',
  },
  {
    key: 'sanel',
    location: { lat: -1.409304081, lng: 36.94911363 },
    title: 'Sanel Hospital Limited',
  },
  {
    key: 'tendercare',
    location: { lat: -1.325297425, lng: 36.88072075 },
    title: 'Tendercare Hospital Limited',
  },
  {
    key: 'oliveSinai',
    location: { lat: -1.398121895, lng: 36.76469108 },
    title: 'Mt. Olive Sinai Hospital',
  },
  {
    key: 'azrah',
    location: { lat: -1.277159666, lng: 36.85159237 },
    title: 'Azrah Medical Centre',
  },
];

function PoiMarker({ poi }: { poi: Poi }) {
  const [infowindowOpen, setInfowindowOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // clicking the marker will toggle the infowindow
  const handleMarkerClick = useCallback(() => setInfowindowOpen((isShown) => !isShown), []);

  // if the maps api closes the infowindow, we have to synchronize our state
  const handleClose = useCallback(() => setInfowindowOpen(false), []);

  return (
    <>
      <AdvancedMarker ref={markerRef} position={poi.location} onClick={handleMarkerClick}>
        <Pin background="#E63524" borderColor="#E63524" />
      </AdvancedMarker>
      {infowindowOpen && (
        <InfoWindow
          anchor={marker}
          maxWidth={400}
          onClose={handleClose}
          className="text-lg/5 font-medium text-[#111827]"
        >
          {poi.title}
        </InfoWindow>
      )}
    </>
  );
}

// function PoiMarkers({ pois }: { pois: Poi[] }) {
//   const map = useMap();
//   const [markers, setMarkers] = useState<{ [key: string]: Marker }>({});
//   const [infowindowOpen, setInfowindowOpen] = useState('');
//   const clusterer = useRef<MarkerClusterer | null>(null);

//   // Initialize MarkerClusterer, if the map has changed
//   useEffect(() => {
//     if (!map) return;
//     if (!clusterer.current) {
//       clusterer.current = new MarkerClusterer({ map });
//     }
//   }, [map]);

//   // Update markers, if the markers array has changed
//   useEffect(() => {
//     clusterer.current?.clearMarkers();
//     clusterer.current?.addMarkers(Object.values(markers));
//   }, [markers]);

//   const setMarkerRef = (marker: Marker | null, key: string) => {
//     if (marker && markers[key]) return;
//     if (!marker && !markers[key]) return;

//     setMarkers((prev) => {
//       if (marker) {
//         return { ...prev, [key]: marker };
//       } else {
//         const newMarkers = { ...prev };
//         delete newMarkers[key];
//         return newMarkers;
//       }
//     });
//   };

//   return (
//     <>
//       {pois.map((poi: Poi) => (
//         <Fragment key={poi.key}>
//           <AdvancedMarker
//             onClick={() => setInfowindowOpen(poi.key)}
//             position={poi.location}
//             ref={(marker) => setMarkerRef(marker, poi.key)}
//           >
//             <Pin background="#E63524" borderColor="#E63524" />
//           </AdvancedMarker>
//           {infowindowOpen === poi.key && (
//             <InfoWindow anchor={markers[poi.key]} maxWidth={200} onClose={() => setInfowindowOpen('')}>
//               {poi.title}
//             </InfoWindow>
//           )}
//         </Fragment>
//       ))}
//     </>
//   );
// }

export default function Maps() {
  return (
    <APIProvider apiKey="AIzaSyD8cfp--YBN0f_TgeYg75Fo2ujb51Nnn7A">
      <div className="h-96">
        <Map
          defaultZoom={11}
          defaultCenter={{
            lat: -1.265436482932997,
            lng: 36.82534134055658,
          }}
          mapId="AFYANZIMA_MAP_ID"
        >
          {/* <PoiMarkers pois={pois} /> */}
          {pois.map((poi: Poi) => (
            <PoiMarker key={poi.key} poi={poi} />
          ))}
        </Map>
      </div>
    </APIProvider>
  );
}
