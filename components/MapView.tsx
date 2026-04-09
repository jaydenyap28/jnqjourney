'use client'

import React, { forwardRef } from 'react'
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

const MapView = forwardRef<MapRef, MapViewProps>(({ locations, onSelectLocation, className, flyToLocation }, ref) => {
  const internalMapRef = React.useRef<MapRef>(null)

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
        {locations.map((location) => (
          <Marker
            key={location.id}
            longitude={location.longitude}
            latitude={location.latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              onSelectLocation(location)
            }}
          >
            <div className="relative flex items-center justify-center w-6 h-6 cursor-pointer hover:scale-110 transition-transform group">
              <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-amber-200"></span>
              <span className="relative inline-flex w-3 h-3 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.8)] border border-white"></span>
              
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs px-2 py-1 rounded shadow-xl">
                {location.name}
              </div>
            </div>
          </Marker>
        ))}
      </Map>
    </div>
  )
})

MapView.displayName = 'MapView'

export default MapView
