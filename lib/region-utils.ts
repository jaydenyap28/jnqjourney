export interface RegionLike {
  id: number
  name: string
  country?: string | null
  parent_id?: number | null
}

export function findRegionById<T extends RegionLike>(regions: T[], regionId?: number | null) {
  if (!regionId) return null
  return regions.find((region) => region.id === regionId) || null
}

export function getRegionCountry<T extends RegionLike>(region: T | null | undefined, regions: T[]) {
  if (!region) return null
  if (region.country) return region.country

  const parent = findRegionById(regions, region.parent_id)
  return parent?.country || null
}

export function getRegionPathSegments<T extends RegionLike>(region: T | null | undefined, regions: T[]) {
  if (!region) return []

  const country = getRegionCountry(region, regions)
  const parent = findRegionById(regions, region.parent_id)

  if (parent && country === 'China') {
    return [country, region.name]
  }

  if (parent && country) {
    return [country, parent.name, region.name]
  }

  if (country) {
    return [country, region.name]
  }

  return [region.name]
}

export function getRegionPathLabel<T extends RegionLike>(region: T | null | undefined, regions: T[]) {
  return getRegionPathSegments(region, regions).join(' / ')
}

export function getRegionOptionLabel<T extends RegionLike>(region: T | null | undefined, regions: T[]) {
  if (!region) return ''

  const country = getRegionCountry(region, regions)
  const parent = findRegionById(regions, region.parent_id)

  if (parent && country === 'China') {
    return `${region.name} (${country})`
  }

  if (parent && country) {
    return `${region.name} (${parent.name}, ${country})`
  }

  if (country) {
    return `${region.name} (${country})`
  }

  return region.name
}

export function getCountryPrimaryRegions<T extends RegionLike>(regions: T[], country: string) {
  const inCountry = regions.filter((region) => getRegionCountry(region, regions) === country)

  if (country === 'China') {
    return inCountry.filter((region) => {
      const hasChildren = inCountry.some((item) => item.parent_id === region.id)
      return region.parent_id ? true : !hasChildren
    })
  }

  return inCountry.filter((region) => !region.parent_id)
}

export function getChildRegions<T extends RegionLike>(regions: T[], parentId?: number | null) {
  if (!parentId) return []
  return regions.filter((region) => region.parent_id === parentId)
}
