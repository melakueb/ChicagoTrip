import { validPoint } from '../../../lib/providers'
import type { Place } from '../../../lib/model'
export async function POST(req: Request) {
  const key = process.env.GOOGLE_SERVER_KEY
  if (!key)
    return Response.json(
      {
        error:
          'Live search is unconfigured. Showing the local Chicago catalog.',
      },
      { status: 503 },
    )
  try {
    const { query, origin, radius } = await req.json()
    if (
      typeof query !== 'string' ||
      !query.trim() ||
      query.length > 120 ||
      !validPoint(origin)
    )
      return Response.json({ error: 'Invalid search.' }, { status: 400 })
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.regularOpeningHours.periods,places.photos.name',
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: 12,
          locationBias: {
            circle: {
              center: { latitude: origin.lat, longitude: origin.lng },
              radius: Math.max(100, Math.min(4000, Number(radius) || 1500)),
            },
          },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!response.ok) throw Error()
    const data = await response.json()
    const places = (data.places ?? [])
      .map(
        (p: {
          id: string
          displayName?: { text: string }
          formattedAddress?: string
          location?: { latitude: number; longitude: number }
          primaryTypeDisplayName?: { text: string }
          rating?: number
          userRatingCount?: number
          priceLevel?: string
          currentOpeningHours?: { openNow?: boolean }
          regularOpeningHours?: { periods: Place['periods'] }
          photos?: {
            name: string
            authorAttributions?: Place['photoAuthors']
          }[]
        }): Place => ({
          id: 'g-' + p.id,
          googleId: p.id,
          name: p.displayName?.text ?? '',
          address: p.formattedAddress ?? '',
          lat: p.location?.latitude ?? NaN,
          lng: p.location?.longitude ?? NaN,
          category: p.primaryTypeDisplayName?.text ?? 'Place',
          neighborhood: 'Chicago',
          setting: 'Mixed',
          notes: '',
          rating: p.rating,
          reviews: p.userRatingCount,
          price: p.priceLevel,
          open: p.currentOpeningHours?.openNow,
          periods: p.regularOpeningHours?.periods,
          photo: p.photos?.[0]?.name,
          photoAuthors: p.photos?.[0]?.authorAttributions,
        }),
      )
      .filter(
        (p: Place) =>
          p.name &&
          validPoint(p) &&
          !/ice skat/i.test(p.name + ' ' + p.category),
      )
    return Response.json({ places })
  } catch {
    return Response.json(
      {
        error:
          'Live search is temporarily unavailable. Showing the local Chicago catalog.',
      },
      { status: 502 },
    )
  }
}
