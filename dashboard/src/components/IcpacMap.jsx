import React, { useState } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, CircleMarker, Tooltip } from 'react-leaflet';

/**
 * Regional context map backed by live ICPAC Geoportal WMS layers
 * (https://geoportal.icpac.net/geoserver/ows). Lets judges see MawinguOps's
 * Machakos focus against official ICPAC layers — maize area, the growing-season
 * windows MawinguOps aligns to, and regional drought hazard.
 *
 * The WMS layers are served by ICPAC GeoServer; OpenStreetMap is the basemap.
 */
const ICPAC_WMS = 'https://geoportal.icpac.net/geoserver/ows';
const MACHAKOS = [-1.52, 37.26];

const LAYERS = [
  {
    id: 'maize',
    label: 'Maize area',
    wms: 'geonode:ken_maize_production',
    note: 'ICPAC: Kenya maize production',
  },
  {
    id: 'long_rains',
    label: 'Long-rains season',
    wms: 'geonode:ke_act_15mar_15sep',
    note: 'ICPAC: actual growing area, MAM (Mar–Sep)',
  },
  {
    id: 'short_rains',
    label: 'Short-rains season',
    wms: 'geonode:ke_act_14oct_15mar',
    note: 'ICPAC: actual growing area, OND (Oct–Mar)',
  },
  {
    id: 'drought',
    label: 'Drought hazard',
    wms: 'geonode:Drought_Hazard_Index',
    note: 'ICPAC: regional drought hazard index',
  },
];

export default function IcpacMap() {
  const [active, setActive] = useState(LAYERS[0]);

  return (
    <div className="rounded-2xl bg-white shadow-md p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-slate-700">ICPAC regional context</h2>
        <div className="flex flex-wrap gap-1">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => setActive(l)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                active.id === l.id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg overflow-hidden border border-slate-100" style={{ height: 320 }}>
        <MapContainer center={MACHAKOS} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <WMSTileLayer
            key={active.id}
            url={ICPAC_WMS}
            layers={active.wms}
            format="image/png"
            transparent
            version="1.1.1"
            opacity={0.7}
          />
          <CircleMarker center={MACHAKOS} radius={7} pathOptions={{ color: '#1e293b', fillColor: '#f59e0b', fillOpacity: 1, weight: 2 }}>
            <Tooltip permanent direction="top" offset={[0, -6]}>Machakos</Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      <p className="text-xs text-slate-500">
        Layer: <span className="font-medium">{active.note}</span> · Source: ICPAC Geoportal (live WMS)
      </p>
    </div>
  );
}
