import type { AgendaEntry, DayPlan, Place, Point, State } from './model'
import { baseState } from './seed'
import { validPoint } from './providers'
export const key = 'chicago-companion-v1'
export const restore = (state: State): State => ({
  ...state,
  days: structuredClone(baseState.days),
  places: { ...baseState.places, ...state.places },
})
export function readState(raw: string | null): State {
  try {
    const state = raw && JSON.parse(raw)
    if (state?.days?.length === 4 && state.places && state.saved && state.trip)
      return state
  } catch {}
  return structuredClone(baseState)
}
export function upsert(state: State, place: Place): [State, string] {
  const match = Object.values(state.places).find(
    (p) =>
      p.id === place.id ||
      (p.googleId && p.googleId === place.googleId) ||
      (p.name.toLowerCase() === place.name.toLowerCase() &&
        distance(p, place) < 120),
  )
  const id = match?.id ?? place.id
  return [
    {
      ...state,
      places: {
        ...state.places,
        [id]: match
          ? {
              ...place,
              ...match,
              id,
              googleId: match.googleId || place.googleId,
              rating: place.rating ?? match.rating,
              reviews: place.reviews ?? match.reviews,
              open: place.open ?? match.open,
              periods: place.periods ?? match.periods,
              price: place.price ?? match.price,
              photo: place.photo ?? match.photo,
              photoAuthors: place.photoAuthors ?? match.photoAuthors,
            }
          : place,
      },
    },
    id,
  ]
}
export function putEntry(
  state: State,
  entry: AgendaEntry,
  index: number,
): State {
  return {
    ...state,
    days: state.days.map((d) => {
      const entries = d.entries.filter((e) => e.id !== entry.id)
      if (d.id === entry.dayId) entries.splice(index, 0, entry)
      return { ...d, entries }
    }),
  }
}
export const removeEntry = (state: State, id: string): State => ({
  ...state,
  days: state.days.map((d) => ({
    ...d,
    entries: d.entries.filter((e) => e.id !== id),
  })),
})
export function toggleStar(state: State, placeId: string): State {
  return {
    ...state,
    saved: {
      ...state.saved,
      [placeId]: { placeId, starred: !state.saved[placeId]?.starred },
    },
  }
}
export function reorder(
  state: State,
  dayId: string,
  from: number,
  to: number,
): State {
  const day = state.days.find((d) => d.id === dayId)
  if (!day?.entries[from] || !day.entries[to]) return state
  return putEntry(state, day.entries[from], to)
}
export function distance(a: Point, b: Point) {
  if (!validPoint(a) || !validPoint(b)) return Infinity
  const rad = Math.PI / 180,
    x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) * rad) / 2),
    y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6371000
}
export const walk = (a: Point, b: Point) =>
  Math.ceil((distance(a, b) * 1.22) / 80)
export const travel = (a: Point, b: Point) =>
  validPoint(a) && validPoint(b) ? walk(a, b) : 0
export const remaining = (d: DayPlan, places: State['places']) =>
  d.entries
    .filter((e) => e.status === 'Planned')
    .map((e) => places[e.placeId])
    .filter(Boolean)
export function impact(places: Point[], p: Point, i: number, origin?: Point) {
  const before = places[i - 1] ?? origin,
    after = places[i]
  return Math.max(
    0,
    (before ? travel(before, p) : 0) +
      (after ? travel(p, after) : 0) -
      (before && after ? travel(before, after) : 0),
  )
}
export const bestIndex = (places: Point[], p: Point, origin?: Point) =>
  Array.from({ length: places.length + 1 }, (_, i) => i).sort(
    (a, b) =>
      impact(places, p, a, origin) - impact(places, p, b, origin) || b - a,
  )[0]
export const minute = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const clock = (t: string) =>
  t
    ? new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(new Date('2027-01-01T' + t + ':00Z'))
    : ''
export function conflicts(entries: AgendaEntry[], places: State['places']) {
  const result: string[] = []
  let available = 0,
    prev: AgendaEntry | undefined
  for (const e of entries.filter((e) => e.status === 'Planned')) {
    if (prev) available += travel(places[prev.placeId], places[e.placeId])
    const start =
      e.mode === 'Anytime' ? available : Math.max(available, minute(e.start))
    if (e.mode === 'Fixed time' && available > minute(e.start))
      result.push(
        places[e.placeId].name + ' may conflict with an earlier stop.',
      )
    if (e.mode === 'Flexible window' && start + e.duration > minute(e.end))
      result.push(places[e.placeId].name + ' may fall outside its time window.')
    available = start + e.duration
    prev = e
  }
  return result
}
export function suggested(
  entries: AgendaEntry[],
  places: State['places'],
  origin?: Point,
) {
  let point = origin
  const result: AgendaEntry[] = []
  let group: AgendaEntry[] = []
  const flush = () => {
    while (group.length) {
      if (point)
        group.sort(
          (a, b) =>
            distance(point!, places[a.placeId]) -
            distance(point!, places[b.placeId]),
        )
      const e = group.shift()!
      result.push(e)
      point = places[e.placeId]
    }
  }
  for (const e of entries) {
    if (e.mode !== 'Anytime' || e.status !== 'Planned') {
      flush()
      result.push(e)
      point = places[e.placeId]
    } else group.push(e)
  }
  flush()
  return result
}
export function openingAt(place: Place, day: number, mins: number) {
  if (!place.periods?.length) return undefined
  const week = 7 * 1440,
    target = day * 1440 + mins
  const at = (t: NonNullable<Place['periods']>[number]['open']) =>
    t.day * 1440 + (t.hour ?? 0) * 60 + (t.minute ?? 0)
  return place.periods.some((p) => {
    if (!p.close) return true
    const start = at(p.open),
      end = at(p.close)
    return (target - start + week) % week < (end - start + week) % week
  })
}
export const directions = (p: Place) =>
  'https://www.google.com/maps/dir/?api=1&destination=' +
  encodeURIComponent(
    p.googleId ? p.name : (p.address || p.name) + ', Chicago, IL',
  ) +
  (p.googleId
    ? '&destination_place_id=' + encodeURIComponent(p.googleId)
    : '') +
  '&travelmode=walking'

export function persistable(state: State): State {
  const places = Object.fromEntries(
    Object.entries(state.places).map(([id, place]) => {
      const {
        rating,
        reviews,
        price,
        open,
        periods,
        photo,
        photoAuthors,
        ...stable
      } = place
      return [id, stable]
    }),
  )
  return { ...state, places }
}

export function chooseNext(
  entries: AgendaEntry[],
  places: State['places'],
  options: {
    origin?: Point
    now?: number
    day: number
    maxWalk: number
    indoors: boolean
  },
) {
  const planned = entries.filter((e) => e.status === 'Planned')
  const fixed = planned
    .filter((e) => e.mode === 'Fixed time')
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const now = options.now
  const fixedTime = fixed ? minute(fixed.start) : Infinity
  const candidates = planned
    .flatMap((e, index) => {
      const p = places[e.placeId],
        walking = options.origin ? travel(options.origin, p) : 0
      const arrival = now === undefined ? undefined : now + walking
      const active =
        e.mode === 'Fixed time'
          ? arrival === undefined || fixedTime - arrival <= 30
          : e.mode === 'Anytime' ||
            arrival === undefined ||
            (arrival >= minute(e.start) &&
              arrival + e.duration <= minute(e.end))
      if (!active) return []
      if (
        e !== fixed &&
        arrival !== undefined &&
        fixed &&
        arrival + e.duration + travel(p, places[fixed.placeId]) + 5 > fixedTime
      )
        return []
      if (
        arrival !== undefined &&
        (p.open === false || openingAt(p, options.day, arrival) === false) &&
        e !== fixed
      )
        return []
      const score =
        (e === fixed && arrival !== undefined ? -100 : 0) +
        index * 3 +
        Math.max(0, walking - options.maxWalk) * 2 +
        walking * 0.25 +
        (options.indoors && p.setting === 'Outdoor' ? 4 : 0) +
        (e.priority === 'Optional' ? 2 : 0)
      return [{ e, score }]
    })
    .sort((a, b) => a.score - b.score)
  return candidates[0]?.e
}
