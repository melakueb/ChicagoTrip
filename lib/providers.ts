import type { Point } from './model'
export const validPoint = (p: Point) =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180
export type RouteData = {
  legs: { from: string; to: string; minutes: number }[]
  paths: Point[][]
}
export function decode(encoded: string): Point[] {
  let index = 0,
    lat = 0,
    lng = 0
  const points: Point[] = []
  function read() {
    let value = 0,
      shift = 0,
      chunk: number
    do {
      if (index >= encoded.length || shift > 30) throw Error('Invalid polyline')
      chunk = encoded.charCodeAt(index++) - 63
      value |= (chunk & 31) << shift
      shift += 5
    } while (chunk >= 32)
    return value & 1 ? ~(value >> 1) : value >> 1
  }
  while (index < encoded.length) {
    lat += read()
    lng += read()
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}
