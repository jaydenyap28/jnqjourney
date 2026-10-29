'use client'

import React, { forwardRef } from 'react'
import MapboxMap, { Source, Layer, MapRef, NavigationControl, Popup } from 'react-map-gl/mapbox'
import { resolveEntityDisplayName } from '@/lib/entity-display-name'
import {usePublicLocale} from './PublicLocale'
import type { PublicLocation } from '@/lib/public-data'

interface MapViewProps {
  locations: PublicLocation[]
  onSelectLocation: (location: PublicLocation) => void
  className?: string
  flyToLocation?: { latitude: number; longitude: number; zoom?: number } | null
}

const MapView = forwardRef<MapRef, MapViewProps>(({ locations, onSelectLocation, className, flyToLocation }, ref) => {
  const locale=usePublicLocale()
  const internalMapRef = React.useRef<MapRef>(null)
  const [mapError, setMapError] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [loaded, setLoaded] = React.useState(false)
  const [hoveredId, setHoveredId] = React.useState<number | null>(null)
  const geojson = React.useMemo(() => ({ type: 'FeatureCollection' as const,
    features: locations.map(location => ({ type: 'Feature' as const, id: location.id,
      properties: { id: location.id }, geometry: { type: 'Point' as const, coordinates: [location.longitude, location.latitude] } }))
  }), [locations])
  const locationById = React.useMemo(() => new Map(locations.map(location => [location.id, location])), [locations])
  const nearestLocation = (ids: number[], point: { x: number; y: number }) => {
    let nearest: PublicLocation | null = null
    let distance = Infinity
    for (const id of ids) {
      const location = locationById.get(id)
      if (!location || !internalMapRef.current) continue
      const projected = internalMapRef.current.project([location.longitude, location.latitude])
      const candidate = (projected.x - point.x) ** 2 + (projected.y - point.y) ** 2
      if (candidate < distance) { nearest = location; distance = candidate }
    }
    return nearest
  }

  React.useImperativeHandle(ref, () => internalMapRef.current!, [])

  React.useEffect(() => {
    if (loaded && flyToLocation && internalMapRef.current) {
      internalMapRef.current.flyTo({
        center: [flyToLocation.longitude, flyToLocation.latitude],
        zoom: flyToLocation.zoom || 14,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
      })
    }
  }, [flyToLocation, loaded])

  return (
    <div className={`w-full h-full relative ${className}`}>
      <MapboxMap
        key={attempt}
        ref={internalMapRef}
        interactiveLayerIds={['journey-spot-targets']}
        onLoad={() => { setLoaded(true); setMapError(false) }}
        onError={() => setMapError(true)}
        onMouseMove={event => setHoveredId(nearestLocation((event.features || []).map(feature => Number((feature as { id?: number }).id)), event.point)?.id ?? null)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={event => {
          const location = nearestLocation((event.features || []).map(feature => Number((feature as { id?: number }).id)), event.point)
          if (location) onSelectLocation(location)
        }}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1Ijoiam5xam91cm5leSIsImEiOiJjbWwzZzhhd2owcmVkM3BvbTcwOHVwMjB5In0.7Jrx-zm0gIjs8qGsiJWUMA"}
        initialViewState={{
          longitude: 101.9758,
          latitude: 4.2105,
          zoom: 6
        }}
        minZoom={2}
        scrollZoom={false}
        cooperativeGestures={true}
        dragPan={true}
        doubleClickZoom={true}
        touchZoomRotate={true}
        keyboard={true}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
      >
        <NavigationControl position="bottom-right" visualizePitch={false} />
        <Source id="journey-locations" type="geojson" data={geojson}>
          <Layer id="journey-spot-targets" type="circle" paint={{ 'circle-radius': 22, 'circle-opacity': 0 }} />
          <Layer id="journey-spots" type="circle" paint={{ 'circle-radius': 6, 'circle-color': '#fbbf24', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }} />
        </Source>
        {hoveredId !== null && locationById.has(hoveredId) ? <Popup longitude={locationById.get(hoveredId)!.longitude} latitude={locationById.get(hoveredId)!.latitude} closeButton={false} closeOnClick={false} anchor="bottom" offset={12}>
          <span className="text-sm text-slate-950">{resolveEntityDisplayName(locationById.get(hoveredId)!, locale).primary}</span>
        </Popup> : null}
      </MapboxMap>
      {!loaded && !mapError ? <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
        {locale === 'en' ? 'Loading map. You can search and browse the places below.' : '地图载入中，可先搜索或浏览下方地点。'}
      </div> : null}
      {mapError ? <div role="status" className="absolute left-1/2 top-1/2 w-[min(90%,24rem)] -translate-x-1/2 rounded-2xl bg-slate-950/95 p-4 text-center text-sm text-white">
        <p>{locale === 'en' ? 'Map unavailable. You can still search and open all places below.' : '地图暂时无法载入，仍可搜索并打开下方所有地点。'}</p>
        <button type="button" className="mt-2 min-h-11 rounded-full border border-white/30 px-4" onClick={() => { setMapError(false); setLoaded(false); setAttempt(value => value + 1) }}>{locale === 'en' ? 'Retry map' : '重试地图'}</button>
      </div> : null}
    </div>
  )
})

MapView.displayName = 'MapView'

export default MapView
