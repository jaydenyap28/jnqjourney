'use client'

import { useMemo, useState } from 'react'
import MapboxMap, { Layer, Marker, NavigationControl, Popup, Source } from 'react-map-gl/mapbox'
import { trackEvent } from '@/lib/analytics'

export interface GuideRouteMapPoint {
  id: number
  label: string
  stopLabel?: string
  latitude: number
  longitude: number
  regionLabel?: string
  dayNumber?: number
}

const routeLineLayer = {
  id: 'guide-route-line',
  type: 'line',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#fbbf24',
    'line-width': 5,
    'line-opacity': 0.9,
  },
} as const

export default function GuideRouteMapCanvas({
  points,
  className,
  emptyMessage = '先关联带坐标的真实景点，这里就会显示路线地图预览。',
  theme = 'dark',
  showCards = true,
  guideSlug,
}: {
  points: GuideRouteMapPoint[]
  className?: string
  emptyMessage?: string
  theme?: 'dark' | 'light'
  showCards?: boolean
  guideSlug?: string
}) {
  const mapPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const bounds = useMemo(() => {
    if (!mapPoints.length) return null
    const longitudes = mapPoints.map((point) => point.longitude)
    const latitudes = mapPoints.map((point) => point.latitude)
    return [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ] as [[number, number], [number, number]]
  }, [mapPoints])

  if (!mapPoints.length || !bounds) {
    return (
      <div className={`rounded-2xl border border-dashed border-white/12 bg-white/[0.04] px-5 py-10 text-sm leading-7 text-white/62 ${className || ''}`}>
        <p className="font-medium text-white">文字路线仍可阅读</p>
        <p className="mt-1">{emptyMessage}</p>
      </div>
    )
  }
  const resolvedBounds = bounds

  const routeGeoJson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: mapPoints.map((point) => [point.longitude, point.latitude]),
    },
    properties: {},
  } as const
  const selectedPoint = mapPoints.find((point) => point.id === selectedId) || null
  const mapStyle = theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'
  const token =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    'pk.eyJ1Ijoiam5xam91cm5leSIsImEiOiJjbWwzZzhhd2owcmVkM3BvbTcwOHVwMjB5In0.7Jrx-zm0gIjs8qGsiJWUMA'

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="h-[330px] md:h-[450px]">
          <MapboxMap
            reuseMaps
            mapboxAccessToken={token}
            initialViewState={{
              bounds: resolvedBounds,
              fitBoundsOptions: { padding: 60, maxZoom: 8 },
            }}
            onLoad={(event) => {
              if (mapPoints.length === 1) {
                event.target.flyTo({ center: [mapPoints[0].longitude, mapPoints[0].latitude], zoom: 8, duration: 0 })
                return
              }
              event.target.fitBounds(resolvedBounds, {
                padding: { top: 72, bottom: 62, left: 54, right: 54 },
                maxZoom: 8,
                duration: 0,
              })
            }}
            onDragStart={() => trackEvent('guide_route_map_interaction', { guide_slug: guideSlug, section: 'drag' })}
            onZoomStart={() => trackEvent('guide_route_map_interaction', { guide_slug: guideSlug, section: 'zoom' })}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapStyle}
            attributionControl
          >
            <NavigationControl position="bottom-right" visualizePitch={false} />
            {mapPoints.length > 1 ? (
              <Source id="guide-route-source" type="geojson" data={routeGeoJson}>
                <Layer {...routeLineLayer} />
              </Source>
            ) : null}
            {mapPoints.map((point, index) => (
              <Marker key={point.id} longitude={point.longitude} latitude={point.latitude} anchor="bottom">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(point.id)
                    trackEvent('guide_route_map_interaction', { guide_slug: guideSlug, section: 'marker', day_number: point.dayNumber })
                  }}
                  className={`relative flex flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${index % 2 ? 'translate-y-4' : '-translate-y-1'}`}
                  aria-label={`${point.stopLabel || `路线第 ${index + 1} 站`} ${point.label}`}
                >
                  <span className="flex min-h-9 min-w-9 items-center justify-center rounded-full border-2 border-slate-950/70 bg-amber-300 px-2 text-[11px] font-bold text-slate-950 shadow-[0_0_0_3px_rgba(255,255,255,0.2),0_8px_22px_rgba(0,0,0,0.45)]">
                    {point.stopLabel || index + 1}
                  </span>
                  <span className="mt-2 max-w-[132px] rounded-md border border-white/15 bg-slate-950/88 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md">
                    {point.label}
                  </span>
                </button>
              </Marker>
            ))}
            {selectedPoint ? (
              <Popup
                longitude={selectedPoint.longitude}
                latitude={selectedPoint.latitude}
                anchor="top"
                offset={16}
                closeOnClick={false}
                onClose={() => setSelectedId(null)}
                className="guide-route-popup"
              >
                <div className="min-w-36 p-1 text-slate-900">
                  <p className="text-xs font-semibold text-amber-700">{selectedPoint.stopLabel || '路线节点'}</p>
                  <p className="mt-1 font-semibold">{selectedPoint.label}</p>
                  {selectedPoint.regionLabel ? <p className="mt-1 text-xs text-slate-500">{selectedPoint.regionLabel}</p> : null}
                </div>
              </Popup>
            ) : null}
          </MapboxMap>
        </div>
      </div>

      {showCards ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {mapPoints.map((point, index) => (
            <div key={`${point.id}-${index}`} className="border-l border-amber-300/35 bg-white/[0.035] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{point.stopLabel || `Point ${index + 1}`}</p>
              <p className="mt-2 text-sm font-semibold text-white">{point.label}</p>
              {point.regionLabel ? <p className="mt-1 text-xs text-white/55">{point.regionLabel}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
