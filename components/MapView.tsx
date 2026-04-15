'use client'

import React, { forwardRef, memo, useMemo } from 'react'
import Map, { Marker, MapRef, NavigationControl } from 'react-map-gl/mapbox'

interface Location {
  id: number
  name: string
  name_cn?: string
  category?: string
  latitude: number
  longitude: number
  review?: string
  visit_date?: string
  video_url?: string
  image_url?: string
  tags?: string[]
  opening_hours?: string
}

interface MapViewProps {
  locations: Location[]
  onSelectLocation: (location: Location) => void
  className?: string
  flyToLocation?: { latitude: number; longitude: number; zoom?: number } | null
}

const LocationMarker = memo(function LocationMarker({
  location,
  onSelectLocation,
}: {
  location: Location
  onSelectLocation: (location: Location) => void
}) {
  return (
    <Marker
      longitude={location.longitude}
      latitude={location.latitude}
      anchor="bottom"
      onClick={(e) => {
        e.originalEvent.stopPropagation()
        onSelectLocation(location)
      }}
    >
      <button
        type="button"
        title={location.name_cn || location.name}
        className="relative flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-white/70 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)] transition-transform hover:scale-110"
      >
        <span className="h-2 w-2 rounded-full bg-white/95" />
      </button>
    </Marker>
  )
})

const MapView = forwardRef<MapRef, MapViewProps>(({ locations, onSelectLocation, className, flyToLocation }, ref) => {
  const internalMapRef = React.useRef<MapRef>(null)
  const validLocations = useMemo(
    () =>
      locations.filter(
        (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
      ),
    [locations]
  )

  // Use either the forwarded ref or internal ref
  React.useImperativeHandle(ref, () => internalMapRef.current!, [])

  // Handle FlyTo trigger
  React.useEffect(() => {
    if (flyToLocation && internalMapRef.current) {
      internalMapRef.current.flyTo({
        center: [flyToLocation.longitude, flyToLocation.latitude],
        zoom: flyToLocation.zoom || 14,
        duration: 2000,
        essential: true
      })
    }
  }, [flyToLocation])

  return (
    <div className={`w-full h-full relative ${className}`}>
      <Map
        ref={internalMapRef}
        reuseMaps
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1Ijoiam5xam91cm5leSIsImEiOiJjbWwzZzhhd2owcmVkM3BvbTcwOHVwMjB5In0.7Jrx-zm0gIjs8qGsiJWUMA"}
        initialViewState={{
          longitude: 101.9758,
          latitude: 4.2105,
          zoom: 6
        }}
        minZoom={2}
        scrollZoom={true}
        dragPan={true}
        doubleClickZoom={true}
        touchZoomRotate={true}
        keyboard={true}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
      >
        <NavigationControl position="bottom-right" visualizePitch={false} />
        {validLocations.map((location) => (
          <LocationMarker
            key={location.id}
            location={location}
            onSelectLocation={onSelectLocation}
          />
        ))}
      </Map>
    </div>
  )
})

MapView.displayName = 'MapView'

export default MapView
