'use client'

import MapboxMap, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/mapbox'

export interface GuideRouteMapPoint {
  id: number
  label: string
  stopLabel?: string
  latitude: number
  longitude: number
  regionLabel?: string
}

const routeLineLayer = {
  id: 'guide-route-line',
  type: 'line',
  paint: {
    'line-color': '#fbbf24',
    'line-width': 3,
    'line-opacity': 0.78,
  },
} as const

export default function GuideRouteMap({
  points,
  className,
  emptyMessage = '\u5148\u5173\u8054\u5e26\u5750\u6807\u7684\u771f\u5b9e\u666f\u70b9\uff0c\u8fd9\u91cc\u5c31\u4f1a\u663e\u793a\u8def\u7ebf\u5730\u56fe\u9884\u89c8\u3002',
  theme = 'dark',
  showCards = true,
}: {
  points: GuideRouteMapPoint[]
  className?: string
  emptyMessage?: string
  theme?: 'dark' | 'light'
  showCards?: boolean
}) {
  const mapPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  )

  if (!mapPoints.length) {
    return (
      <div className={`rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-sm text-white/55 ${className || ''}`}>
        {emptyMessage}
      </div>
    )
  }

  const longitudes = mapPoints.map((point) => point.longitude)
  const latitudes = mapPoints.map((point) => point.latitude)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)

  const centerLongitude = (minLng + maxLng) / 2
  const centerLatitude = (minLat + maxLat) / 2
  const spread = Math.max(maxLng - minLng, maxLat - minLat)
  const zoom = spread > 18 ? 2.2 : spread > 8 ? 3.4 : spread > 3 ? 4.6 : spread > 1 ? 6 : 8.2

  const routeGeoJson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: mapPoints.map((point) => [point.longitude, point.latitude]),
    },
    properties: {},
  } as const

  const mapStyle = theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'
  const token =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    'pk.eyJ1Ijoiam5xam91cm5leSIsImEiOiJjbWwzZzhhd2owcmVkM3BvbTcwOHVwMjB5In0.7Jrx-zm0gIjs8qGsiJWUMA'

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/30">
        <div className="h-[280px]">
          <MapboxMap
            reuseMaps
            attributionControl={false}
            mapboxAccessToken={token}
            initialViewState={{
              longitude: centerLongitude,
              latitude: centerLatitude,
              zoom,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapStyle}
          >
            <NavigationControl position="top-right" visualizePitch={false} />
            {mapPoints.length > 1 ? (
              <Source id="guide-route-source" type="geojson" data={routeGeoJson}>
                <Layer {...routeLineLayer} />
              </Source>
            ) : null}
            {mapPoints.map((point, index) => (
              <Marker key={point.id} longitude={point.longitude} latitude={point.latitude} anchor="bottom">
                <div className="relative flex flex-col items-center">
                  <div className="flex h-8 min-w-8 items-center justify-center rounded-full border border-white/50 bg-amber-400 px-2 text-xs font-semibold text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.45)]">
                    {point.stopLabel || index + 1}
                  </div>
                  <div className="mt-2 max-w-[120px] rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] text-white/85 backdrop-blur-sm">
                    {point.label}
                  </div>
                </div>
              </Marker>
            ))}
          </MapboxMap>
        </div>
      </div>

      {showCards ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {mapPoints.map((point, index) => (
            <div key={`${point.id}-${index}`} className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.26em] text-white/42">
                {point.stopLabel || `Point ${index + 1}`}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{point.label}</p>
              {point.regionLabel ? <p className="mt-1 text-xs text-white/55">{point.regionLabel}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
