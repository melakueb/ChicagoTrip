import { decode, validPoint } from '../../../lib/providers'
import type { Point } from '../../../lib/model'
export async function POST(req: Request) {
  const key = process.env.GOOGLE_SERVER_KEY
  if (!key)
    return Response.json(
      { error: 'Walking directions are unconfigured.' },
      { status: 503 },
    )
  try {
    const { points } = (await req.json()) as {
      points: (Point & { id: string })[]
    }
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 12 ||
      points.some((p) => !validPoint(p) || typeof p.id !== 'string')
    )
      return Response.json({ error: 'Invalid route points.' }, { status: 400 })
    const waypoint = (p: Point) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    })
    const result = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'routes.legs.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: waypoint(points[0]),
          destination: waypoint(points.at(-1)!),
          intermediates: points.slice(1, -1).map(waypoint),
          travelMode: 'WALK',
        }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      },
    )
    if (!result.ok) throw Error()
    const route = (await result.json()).routes?.[0]
    if (
      !route?.polyline?.encodedPolyline ||
      route.legs?.length !== points.length - 1
    )
      throw Error()
    const legs = route.legs.map((l: { duration: string }, i: number) => ({
      from: points[i].id,
      to: points[i + 1].id,
      minutes: Math.ceil(parseFloat(l.duration) / 60),
    }))
    if (
      legs.some(
        (l: { minutes: number }) =>
          !Number.isFinite(l.minutes) || l.minutes < 0,
      )
    )
      throw Error()
    return Response.json({
      legs,
      paths: [decode(route.polyline.encodedPolyline)],
    })
  } catch {
    return Response.json(
      { error: 'Walking directions are temporarily unavailable.' },
      { status: 502 },
    )
  }
}
