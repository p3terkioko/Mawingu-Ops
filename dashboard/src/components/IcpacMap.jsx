import React, { useState } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import Card from './ui/Card.jsx';
import SegmentedControl from './ui/SegmentedControl.jsx';

/**
 * Regional context map backed by live ICPAC Geoportal WMS layers
 * (https://geoportal.icpac.net/geoserver/ows). Lets judges see MawinguOps's
 * Machakos focus against official ICPAC layers — maize area, the growing-season
 * windows MawinguOps aligns to, and regional drought hazard.
 *
 * The WMS layers are served by ICPAC GeoServer; a CARTO dark-matter basemap
 * keeps the map from clashing with the dark UI.
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
    label: 'Long rains',
    wms: 'geonode:ke_act_15mar_15sep',
    note: 'ICPAC: actual growing area, MAM (Mar–Sep)',
  },
  {
    id: 'short_rains',
    label: 'Short rains',
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
  const [activeId, setActiveId] = useState(LAYERS[0].id);
  const active = LAYERS.find((l) => l.id === activeId) || LAYERS[0];

  return (
    <Card className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-card-title font-medium text-primary">
          ICPAC regional context
        </h2>
        <SegmentedControl
          size="sm"
          ariaLabel="Map layer"
          options={LAYERS.map((l) => ({ value: l.id, label: l.label }))}
          value={activeId}
          onChange={setActiveId}
          className="w-full"
        />
      </div>

      <div className="overflow-hidden rounded-control border border-border" style={{ height: 320 }}>
        <MapContainer
          center={MACHAKOS}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
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
          <CircleMarker
            center={MACHAKOS}
            radius={7}
            pathOptions={{
              color: 'var(--bg-canvas)',
              fillColor: 'var(--gold)',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]}>
              Machakos
            </Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      <p className="text-caption text-secondary">
        Layer: <span className="font-medium text-primary">{active.note}</span> · Source: ICPAC
        Geoportal (live WMS)
      </p>
    </Card>
  );
}
