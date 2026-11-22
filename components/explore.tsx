'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BedDouble,
  Car,
  CloudSnow,
  Crosshair,
  Expand,
  Footprints,
  Map as MapIcon,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Star,
} from 'lucide-react'
import type { DayPlan, Place, Point, State, Trip } from '../lib/model'
import {
  distance,
  openingAt,
  remaining,
  walk,
} from '../lib/planner'
import { validPoint, type RouteData } from '../lib/providers'
import { hotels } from '../lib/seed'
import { Field } from './ui'

type Weather = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    wind_speed_10m: number
    precipitation: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
  }
}
let weatherRequest: Promise<Weather | undefined> | undefined
let weatherUntil = 0
export function useWeather(enabled: boolean) {
  const [weather, setWeather] = useState<Weather>()
  useEffect(() => {
    if (!enabled) return
    if (!weatherRequest || Date.now() > weatherUntil) {
      weatherUntil = Date.now() + 900000
      weatherRequest = fetch('/api/weather')
        .then((r) => (r.ok ? r.json() : undefined))
        .catch(() => undefined)
    }
    let active = true
    weatherRequest.then((v) => {
      if (active) setWeather(v)
    })
    return () => {
      active = false
    }
  }, [enabled])
  return weather
}
const routes = new Map<string, Promise<RouteData | undefined>>()
function routeFor(
  points: (Point & { id: string })[],
): Promise<RouteData | undefined> {
  if (
    points.length < 2 ||
    points.length > 12 ||
    points.some((p) => !validPoint(p))
  )
    return Promise.resolve(undefined)
  const key = JSON.stringify(
    points.map(({ id, lat, lng }) => ({ id, lat, lng })),
  )
  const cached = routes.get(key)
  if (cached) return cached
  const request = fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: JSON.parse(key) }),
  })
    .then((r) => (r.ok ? r.json() : undefined))
    .catch(() => undefined)
    .then((value) => {
      if (!value) routes.delete(key)
      return value
    })
  if (routes.size >= 32) routes.delete(routes.keys().next().value!)
  routes.set(key, request)
  return request
}
export function useWalking(points: Place[], enabled: boolean) {
  const serialized = JSON.stringify(
    points.filter(validPoint).map(({ id, lat, lng }) => ({ id, lat, lng })),
  )
  const [route, setRoute] = useState<{
    serialized: string
    value?: RouteData
  }>()
  useEffect(() => {
    if (!enabled) return
    let active = true
    routeFor(JSON.parse(serialized)).then((value) => {
      if (active) setRoute({ serialized, value })
    })
    return () => {
      active = false
    }
  }, [enabled, serialized])
  return route?.serialized === serialized ? route.value : undefined
}

type Marker = {
  id: string
  point: Point
  title: string
  color: string
  label: string
  place?: Place
}
type MapProps = {
  day: DayPlan
  state: State
  gps?: Point
  hotel?: Place
  selected?: Place
  walking?: RouteData
  setPoint: (p: Point) => void
  onPlace: (p: Place) => void
  locate: () => void
  locationText: string
  discoveries?: Place[]
}
type GoogleMap = {
  fitBounds: (b: unknown, padding: number) => void
  setCenter: (p: Point) => void
  setZoom: (z: number) => void
  addListener: (
    event: string,
    fn: (e: { latLng?: { toJSON: () => Point } }) => void,
  ) => Listener
}
type Listener = { remove: () => void }
type GoogleMaps = {
  Map: new (el: HTMLElement, opt: object) => GoogleMap
  Marker: new (opt: object) => {
    setMap: (map: null) => void
    addListener: (e: string, fn: () => void) => Listener
  }
  Polyline: new (opt: object) => { setMap: (map: null) => void }
  LatLngBounds: new () => { extend: (p: Point) => void }
  SymbolPath: { CIRCLE: unknown }
}
let googlePromise: Promise<GoogleMaps> | undefined
function loadGoogle() {
  const win = window as Window & {
    google?: { maps: GoogleMaps }
    chicagoMapsReady?: () => void
    gm_authFailure?: () => void
  }
  if (win.google?.maps?.Map) return Promise.resolve(win.google.maps)
  return (googlePromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = setTimeout(() => reject(Error('Map timed out')), 12000)
    win.chicagoMapsReady = () => {
      clearTimeout(timeout)
      if (win.google?.maps) resolve(win.google.maps)
      else reject(Error('Map unavailable'))
    }
    script.onerror = () => {
      clearTimeout(timeout)
      reject(Error('Map unavailable'))
    }
    script.src =
      'https://maps.googleapis.com/maps/api/js?key=' +
      encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '') +
      '&loading=async&callback=chicagoMapsReady'
    script.async = true
    document.head.append(script)
  }))
}
const downtown = { lat: 41.8826, lng: -87.624 }
function LocalMap({
  markers,
  paths,
  onPlace,
  setPoint,
}: {
  markers: Marker[]
  paths: Point[][]
  onPlace: (p: Place) => void
  setPoint: (p: Point) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const coords = markers.map((m) => m.point)
  const bounds = {
    n:
      Math.max(
        ...coords.map((p) => p.lat),
        coords.length ? -90 : downtown.lat,
      ) + 0.003,
    s:
      Math.min(...coords.map((p) => p.lat), coords.length ? 90 : downtown.lat) -
      0.003,
    e:
      Math.max(
        ...coords.map((p) => p.lng),
        coords.length ? -180 : downtown.lng,
      ) + 0.004,
    w:
      Math.min(
        ...coords.map((p) => p.lng),
        coords.length ? 180 : downtown.lng,
      ) - 0.004,
  }
  const xy = (p: Point) => [
    ((p.lng - bounds.w) / (bounds.e - bounds.w)) * 100,
    ((bounds.n - p.lat) / (bounds.n - bounds.s)) * 100,
  ]
  const [pin, setPin] = useState<Point>()
  return (
    <div
      ref={ref}
      className="local-map"
      onClick={(e) => {
        const b = ref.current!.getBoundingClientRect()
        const point = {
          lat:
            bounds.n - ((e.clientY - b.top) / b.height) * (bounds.n - bounds.s),
          lng:
            bounds.w + ((e.clientX - b.left) / b.width) * (bounds.e - bounds.w),
        }
        setPin(point)
        setPoint(point)
      }}
    >
      <svg
        className="local-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {paths.map((path, i) => (
          <polyline
            key={i}
            points={path.map((p) => xy(p).join(',')).join(' ')}
            stroke="#6758df"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="5 4"
            fill="none"
          />
        ))}
      </svg>
      {markers.map((m) => {
        const [x, y] = xy(m.point)
        return (
          <button
            className="local-pin"
            title={m.title}
            aria-label={m.title}
            key={m.id}
            style={{ left: x + '%', top: y + '%', background: m.color }}
            onClick={(e) => {
              e.stopPropagation()
              if (m.place) onPlace(m.place)
              else {
                setPin(m.point)
                setPoint(m.point)
              }
            }}
          >
            {m.label}
          </button>
        )
      })}
      {pin && (
        <span
          className="local-pin point-pin"
          style={{ left: xy(pin)[0] + '%', top: xy(pin)[1] + '%' }}
        >
          +
        </span>
      )}
      <span className="local-caption">
        Local route diagram · no street data
      </span>
    </div>
  )
}
export function MapPanel({
  day,
  state,
  gps,
  hotel,
  selected,
  walking,
  setPoint,
  onPlace,
  locate,
  locationText,
  discoveries,
}: MapProps) {
  const [full, setFull] = useState(false)
  const [google, setGoogle] = useState<GoogleMaps>()
  const [failed, setFailed] = useState(false)
  const [selection, setSelection] = useState(false)
  const element = useRef<HTMLDivElement>(null)
  const instance = useRef<GoogleMap | null>(null)
  const callbacks = useRef({ setPoint, onPlace })
  useEffect(() => {
    callbacks.current = { setPoint, onPlace }
  }, [onPlace, setPoint])
  const stops = remaining(day, state.places)
  const markers: Marker[] = day.entries.flatMap((entry, i) => {
    const p = state.places[entry.placeId]
    return validPoint(p)
      ? [
          {
            id: entry.id,
            point: p,
            title: p.name,
            place: p,
            color:
              entry.status === 'Visited'
                ? '#177452'
                : entry.status === 'Skipped'
                  ? '#677083'
                  : entry.priority === 'Must visit'
                    ? '#5346d7'
                    : '#ae5a27',
            label: String(i + 1),
          },
        ]
      : []
  })
  const pointMarker = (p: Place, color: string, label: string) => {
    if (validPoint(p) && !markers.some((m) => m.place?.id === p.id))
      markers.push({
        id: p.id,
        point: p,
        title: p.name,
        place: p,
        color,
        label,
      })
  }
  if (hotel) pointMarker(hotel, '#26384f', 'H')
  if (selected) pointMarker(selected, '#ab4874', '•')
  discoveries?.forEach((p) => pointMarker(p, '#ab4874', '•'))
  if (gps)
    markers.push({
      id: 'gps',
      point: gps,
      title: 'Your location',
      color: '#1e79da',
      label: '◎',
    })
  const simple = [stops.filter(validPoint)]
  const paths = walking?.paths ?? simple
  const model = JSON.stringify({ markers, paths, live: !!walking })
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) return
    let active = true
    loadGoogle()
      .then((m) => {
        if (active) setGoogle(m)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    window.addEventListener('chicago-map-auth-error', auth)
    function auth() {
      setFailed(true)
    }
    ;(window as Window & { gm_authFailure?: () => void }).gm_authFailure = () =>
      window.dispatchEvent(new Event('chicago-map-auth-error'))
    return () => {
      active = false
      window.removeEventListener('chicago-map-auth-error', auth)
    }
  }, [])
  useEffect(() => {
    if (!google || failed || !element.current) return
    const { markers, paths, live } = JSON.parse(model) as {
      markers: Marker[]
      paths: Point[][]
      live: boolean
    }
    const map = (instance.current ??= new google.Map(element.current, {
      center: downtown,
      zoom: 14,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    }))
    const bounds = new google.LatLngBounds()
    const pins = markers.map((m) => {
      bounds.extend(m.point)
      const marker = new google.Marker({
        map,
        position: m.point,
        title: m.title,
        label: { text: m.label, color: 'white', fontWeight: 'bold' },
        icon: {
          path: google.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: m.color,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      })
      const listener = marker.addListener('click', () => {
        if (m.place) callbacks.current.onPlace(m.place)
        else {
          callbacks.current.setPoint(m.point)
          setSelection(true)
        }
      })
      return { marker, listener }
    })
    const lines = paths.map(
      (path) =>
        new google.Polyline({
          map,
          path,
          strokeColor: '#5848db',
          strokeOpacity: live ? 0.93 : 0.45,
          strokeWeight: live ? 5 : 3,
        }),
    )
    if (markers.length > 1) map.fitBounds(bounds, 45)
    else if (markers.length) {
      map.setCenter(markers[0].point)
      map.setZoom(15)
    }
    const click = map.addListener('click', (e) => {
      if (e.latLng) {
        callbacks.current.setPoint(e.latLng.toJSON())
        setSelection(true)
      }
    })
    return () => {
      click.remove()
      pins.forEach(({ marker, listener }) => {
        listener.remove()
        marker.setMap(null)
      })
      lines.forEach((line) => line.setMap(null))
    }
  }, [google, failed, model])
  return (
    <>
      <div className="map-tools">
        <button
          className="secondary"
          onClick={() => {
            if (gps) {
              instance.current?.setCenter(gps)
              instance.current?.setZoom(15)
            } else locate()
          }}
        >
          <Crosshair size={16} /> {gps ? 'Recenter' : 'Use my location'}
        </button>
        <button className="secondary" onClick={() => setFull(!full)}>
          <Expand size={16} /> {full ? 'Collapse map' : 'Expand map'}
        </button>
        {hotel && (
          <button
            className="secondary"
            onClick={() => {
              instance.current?.setCenter(hotel)
              onPlace(hotel)
            }}
          >
            <BedDouble size={16} /> Hotel
          </button>
        )}
      </div>
      <div className={'map ' + (full ? 'full' : '')}>
        {google && !failed ? (
          <div ref={element} style={{ width: '100%', height: '100%' }} />
        ) : (
          <LocalMap
            markers={markers}
            paths={simple}
            onPlace={onPlace}
            setPoint={(p) => {
              setPoint(p)
              setSelection(true)
            }}
          />
        )}
      </div>
      <p className="map-legend">
        {walking
          ? 'Google walking route'
          : 'Approximate stop connections · walking route unavailable'}{' '}
        · Purple must visit · Green visited · Gray skipped
        {selection ? ' · Search point set' : ''}
      </p>
      {locationText && <p role="status">{locationText}</p>}
    </>
  )
}

const categories = [
  'Restaurants',
  'Coffee',
  'Bakeries',
  'Desserts',
  'Shopping',
  'Boutiques',
  'Attraction',
  'Museums',
  'Architecture',
  'Entertainment',
  'Indoor activities',
  'Cultural',
  'Nearby essentials',
]
const times = [5, 10, 15, 20, 25]
export function Discover(
  props: MapProps & {
    mapPoint?: Point
    weather?: Weather
    initialIndoor?: boolean
    onAdd: (p: Place) => void
    onStar: (p: Place) => void
    onSave: (p: Place) => void
  },
) {
  const { day, state, gps, hotel, mapPoint, onAdd, onStar, onSave, onPlace } =
    props
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [walkLimit, setWalkLimit] = useState(state.trip.preferences.walking)
  const [detour, setDetour] = useState('')
  const [rating, setRating] = useState('')
  const [price, setPrice] = useState('')
  const [setting, setSetting] = useState(props.initialIndoor ? 'Indoor' : '')
  const [open, setOpen] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [saved, setSaved] = useState('')
  const [along, setAlong] = useState(false)
  const [mode, setMode] = useState('Next stop')
  const [asMap, setAsMap] = useState(false)
  const [status, setStatus] = useState(
    'Showing the local Chicago catalog. Search to check for live results.',
  )
  const [live, setLive] = useState<Place[]>([])
  const [routed, setRouted] = useState<
    Record<string, { walk: number; detour: number }>
  >({})
  const next = remaining(day, state.places).find(validPoint)
  const center =
    mode === 'Current location'
      ? gps
      : mode === 'Hotel'
        ? hotel
        : mode === 'Map point'
          ? mapPoint
          : next
  const origin = center ?? next ?? downtown
  const search = (query.trim() || category).slice(0, 100)
  const preferences = state.trip.preferences
  const affinity = (place: Place) => {
    const text = (
      place.name +
      ' ' +
      place.category +
      ' ' +
      place.notes +
      ' ' +
      (place.price ?? '')
    ).toLowerCase()
    const terms = [
      preferences.cuisine,
      preferences.dietary,
      preferences.shopping,
      preferences.categories,
      preferences.price,
    ]
      .join(',')
      .toLowerCase()
      .split(/[,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    return (
      terms.filter((t) => text.includes(t)).length +
      Number(preferences.weather === place.setting)
    )
  }
  useEffect(() => {
    if (!search) {
      setLive([])
      setStatus('Showing the local Chicago catalog.')
      return
    }
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      setStatus('Searching Chicago…')
      setLive([])
      try {
        const response = await fetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: search + ' Chicago',
            origin,
            radius: state.trip.preferences.radius,
          }),
          signal: abort.signal,
        })
        const data = await response.json()
        if (abort.signal.aborted) return
        setLive(data.places ?? [])
        setStatus(
          response.ok ? 'Google Maps results and local places' : data.error,
        )
      } catch {
        if (!abort.signal.aborted)
          setStatus('Live search unavailable. Showing local places.')
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [search, origin.lat, origin.lng, state.trip.preferences.radius])
  const pool = useMemo(() => {
    const results = new Map<string, Place>()
    for (const p of [...Object.values(state.places), ...live]) {
      const match = [...results.values()].find(
        (x) =>
          x.id === p.id ||
          (p.googleId && p.googleId === x.googleId) ||
          (x.name.toLowerCase() === p.name.toLowerCase() &&
            distance(x, p) < 120),
      )
      results.set(match?.id ?? p.id, { ...match, ...p, id: match?.id ?? p.id })
    }
    return [...results.values()]
  }, [live, state.places])
  const now = new Date()
  const chicago = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number)
  const arrivalDay = new Date(day.date + 'T12:00:00Z').getUTCDay()
  const arrivalBase = state.days
    .find((d) => d.id === day.id)
    ?.entries.find((e) => e.placeId === next?.id)?.start
  const arrivalTime = arrivalBase
    ? arrivalBase
        .split(':')
        .map(Number)
        .reduce((h, m) => h * 60 + m)
    : chicago[0] * 60 + chicago[1]
  const results = pool
    .filter(validPoint)
    .filter((p) => {
      const hay = (
        p.name +
        ' ' +
        p.category +
        ' ' +
        p.neighborhood +
        ' ' +
        p.notes
      ).toLowerCase()
      const localSearch = query
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .split(/\s+/)
        .filter(
          (s) =>
            s.length >= 4 &&
            ![
              'near',
              'nearby',
              'around',
              'along',
              'within',
              'minutes',
              'things',
              'good',
              'route',
              'activities',
            ].includes(s),
        )
      const liveMatch = live.some(
        (l) => l.googleId && l.googleId === p.googleId,
      )
      return (
        !/ice skat/i.test(hay) &&
        (!localSearch.length ||
          liveMatch ||
          localSearch.some((s) => hay.includes(s))) &&
        (!category ||
          (category === 'Indoor activities'
            ? p.setting === 'Indoor'
            : category.toLowerCase().startsWith(p.category.toLowerCase()) ||
              hay.includes(category.toLowerCase().replace(/s$/, '')) ||
              liveMatch)) &&
        (!setting || p.setting === setting) &&
        (!neighborhood || p.neighborhood === neighborhood) &&
        (!saved ||
          (saved === 'yes' ? !!state.saved[p.id] : !state.saved[p.id])) &&
        (!rating || (p.rating ?? 0) >= Number(rating)) &&
        (!price || price === p.price)
      )
    })
    .map((p) => {
      const w = walk(origin, p)
      const extra = next
        ? Math.max(0, w + walk(p, next) - walk(origin, next))
        : w
      return { p, w, extra }
    })
    .sort((a, b) => a.extra - b.extra || a.w - b.w)
    .slice(0, 24)
  const shortlist = JSON.stringify(
    results.slice(0, 4).map(({ p }) => ({ id: p.id, lat: p.lat, lng: p.lng })),
  )
  const routeOrigin = JSON.stringify({
    id: 'origin',
    lat: origin.lat,
    lng: origin.lng,
  })
  const routeNext = JSON.stringify(
    next ? { id: 'next', lat: next.lat, lng: next.lng } : null,
  )
  useEffect(() => {
    setRouted({})
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || !search) return
    let active = true
    const start = JSON.parse(routeOrigin),
      end = JSON.parse(routeNext)
    const ageSensitive = setTimeout(async () => {
      const distinctEnd = end && distance(start, end) > 5
      const baseline = distinctEnd ? await routeFor([start, end]) : undefined
      const settled = await Promise.allSettled(
        (JSON.parse(shortlist) as (Point & { id: string })[]).map(async (p) => {
          if (distance(start, p) < 5) return null
          const modified = await routeFor(
            end && distance(p, end) > 5 ? [start, p, end] : [start, p],
          )
          if (!modified || (distinctEnd && !baseline)) return null
          const total = modified.legs.reduce((sum, l) => sum + l.minutes, 0)
          return [
            p.id,
            {
              walk: modified.legs[0].minutes,
              detour: Math.max(0, total - (baseline?.legs[0].minutes ?? 0)),
            },
          ] as const
        }),
      )
      if (active)
        setRouted(
          Object.fromEntries(
            settled.flatMap((x) =>
              x.status === 'fulfilled' && x.value ? [x.value] : [],
            ),
          ),
        )
    }, 450)
    return () => {
      active = false
      clearTimeout(ageSensitive)
    }
  }, [shortlist, routeOrigin, routeNext, search])
  const ranked = results
    .map(({ p, w, extra }) => {
      const live = routed[p.id]
      return { p, live, w: live?.walk ?? w, extra: live?.detour ?? extra }
    })
    .filter(
      ({ p, w, extra }) =>
        w <= walkLimit &&
        (!along || extra <= 5) &&
        (!detour || extra <= Number(detour)) &&
        (!open ||
          (open === 'now'
            ? p.open === true
            : openingAt(p, arrivalDay, arrivalTime + w) === true)),
    )
    .sort(
      (a, b) =>
        a.extra - b.extra ||
        (props.weather?.current.apparent_temperature &&
        props.weather.current.apparent_temperature < 25
          ? Number(b.p.setting === 'Indoor') - Number(a.p.setting === 'Indoor')
          : 0) ||
        Number(openingAt(b.p, arrivalDay, arrivalTime + b.w) === true) -
          Number(openingAt(a.p, arrivalDay, arrivalTime + a.w) === true) ||
        a.w - b.w ||
        affinity(b.p) - affinity(a.p) ||
        (b.p.rating ?? 0) - (a.p.rating ?? 0) ||
        (b.p.reviews ?? 0) - (a.p.reviews ?? 0),
    )
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">EXPLORE CHICAGO</span>
        <h1>Discover</h1>
        <p>Find places near your next stop or along your route.</p>
      </div>
      <label className="searchbox">
        <Search size={19} />
        <input
          aria-label="Search Chicago places"
          placeholder="Try coffee, desserts, or indoor attractions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="chips">
        {['', ...categories].map((c) => (
          <button
            key={c}
            className={category === c ? 'on' : ''}
            onClick={() => setCategory(c)}
          >
            {c || 'All'}
          </button>
        ))}
      </div>
      <div className="button-row">
        <Field label="Search from">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {['Current location', 'Next stop', 'Hotel', 'Map point'].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </Field>
        <Field label="Walking limit">
          <select
            value={walkLimit}
            onChange={(e) => setWalkLimit(Number(e.target.value))}
          >
            {times.map((i) => (
              <option key={i} value={i}>
                {i} min
              </option>
            ))}
          </select>
        </Field>
        {mode === 'Current location' && !gps && (
          <button className="secondary" onClick={props.locate}>
            <Crosshair size={16} /> Enable location
          </button>
        )}
        <button className="secondary" onClick={() => setAsMap(!asMap)}>
          {asMap ? <List size={16} /> : <MapIcon size={16} />}{' '}
          {asMap ? 'List' : 'Map'}
        </button>
        <button
          className="secondary"
          aria-pressed={setting === 'Indoor'}
          onClick={() => setSetting(setting === 'Indoor' ? '' : 'Indoor')}
        >
          Show indoor alternatives
        </button>
      </div>
      {!center && (
        <p className="map-legend">
          {mode} is unavailable. Using the next mapped stop or downtown Chicago.
        </p>
      )}
      {props.locationText && mode === 'Current location' && (
        <p role="status">{props.locationText}</p>
      )}
      <details className="panel">
        <summary>More filters</summary>
        <div className="form-grid">
          <Field label="Opening hours">
            <select value={open} onChange={(e) => setOpen(e.target.value)}>
              <option value="">Any hours</option>
              <option value="now">Open now</option>
              <option value="arrival">
                Regular hours at estimated arrival
              </option>
            </select>
          </Field>
          <Field label="Minimum rating">
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Any rating</option>
              <option>3</option>
              <option>4</option>
              <option>4.5</option>
            </select>
          </Field>
          <Field label="Price">
            <select value={price} onChange={(e) => setPrice(e.target.value)}>
              <option value="">Any price</option>
              {[
                'FREE',
                'INEXPENSIVE',
                'MODERATE',
                'EXPENSIVE',
                'VERY_EXPENSIVE',
              ].map((x) => (
                <option key={x} value={'PRICE_LEVEL_' + x}>
                  {x.toLowerCase().replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Setting">
            <select
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
            >
              <option value="">Any setting</option>
              <option>Indoor</option>
              <option>Outdoor</option>
              <option>Mixed</option>
            </select>
          </Field>
          <Field label="Neighborhood">
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            >
              <option value="">All neighborhoods</option>
              {[...new Set(pool.map((p) => p.neighborhood))].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Saved places">
            <select value={saved} onChange={(e) => setSaved(e.target.value)}>
              <option value="">All places</option>
              <option value="yes">Saved only</option>
              <option value="no">New only</option>
            </select>
          </Field>
          <Field label="Maximum detour">
            <select value={detour} onChange={(e) => setDetour(e.target.value)}>
              <option value="">Any detour</option>
              {times.map((t) => (
                <option key={t} value={t}>
                  {t} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Along planned route">
            <input
              type="checkbox"
              checked={along}
              onChange={(e) => setAlong(e.target.checked)}
            />
          </Field>
        </div>
      </details>
      <p className="map-legend" role="status">
        {status}
        {live.length > 0 && ' · Live data from Google Maps'}
      </p>
      {asMap ? (
        <MapPanel {...props} discoveries={ranked.map((r) => r.p)} />
      ) : (
        ranked.map(({ p, w, extra, live }) => (
          <article className="panel result" key={p.id}>
            {p.photo && (
              <figure>
                <img
                  alt=""
                  loading="lazy"
                  src={'/api/photo?name=' + encodeURIComponent(p.photo)}
                />
                {p.photoAuthors?.map((a) => (
                  <figcaption key={a.displayName}>
                    {a.uri ? (
                      <a href={a.uri} target="_blank" rel="noreferrer">
                        {a.displayName}
                      </a>
                    ) : (
                      a.displayName
                    )}
                  </figcaption>
                ))}
              </figure>
            )}
            <div>
              <button className="place-title" onClick={() => onPlace(p)}>
                {p.name}
              </button>
              <p>
                {p.category} · {p.neighborhood}{' '}
                {p.rating !== undefined && ' · ' + p.rating + ' ★'}
                {p.reviews !== undefined && ' (' + p.reviews + ')'}
                {p.price &&
                  ' · ' +
                    p.price
                      .replace('PRICE_LEVEL_', '')
                      .toLowerCase()
                      .replaceAll('_', ' ')}
              </p>
              <small>
                {w} min walk · +{extra} min {next ? 'detour' : 'travel'} ·{' '}
                {live ? 'Google walking route' : 'local estimate'} ·{' '}
                {p.open === undefined
                  ? 'Hours unavailable'
                  : p.open
                    ? 'Open now'
                    : 'Closed now'}
              </small>
              <div className="button-row">
                <button className="secondary" onClick={() => onSave(p)}>
                  {state.saved[p.id] ? 'Saved' : 'Save'}
                </button>
                <button
                  className={
                    'icon star ' + (state.saved[p.id]?.starred ? 'active' : '')
                  }
                  aria-label={'Toggle star for ' + p.name}
                  onClick={() => onStar(p)}
                >
                  <Star size={17} />
                </button>
                <button className="primary" onClick={() => onAdd(p)}>
                  <Plus size={16} /> Add to agenda
                </button>
              </div>
            </div>
          </article>
        ))
      )}
      {!ranked.length && (
        <p className="empty">
          No matches within these filters. Try a longer walk or a different
          starting point.
        </p>
      )}
    </>
  )
}
export function TripPanel({
  trip,
  update,
  weather,
  restore,
}: {
  trip: Trip
  update: (t: Trip) => void
  weather?: Weather
  restore: () => void
}) {
  const hotel = hotels.find((h) => h.id === trip.hotelId)
  function change<K extends keyof Trip>(key: K, value: Trip[K]) {
    update({ ...trip, [key]: value })
  }
  function pref<K extends keyof Trip['preferences']>(
    key: K,
    value: Trip['preferences'][K],
  ) {
    change('preferences', { ...trip.preferences, [key]: value })
  }
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">JANUARY 1–4, 2027</span>
        <h1>Trip details</h1>
        <p>Cincinnati, Ohio → Chicago, Illinois</p>
      </div>
      <section className="panel">
        <h2>
          <Car size={18} className="inline" /> Driving plans
        </h2>
        <p>
          <strong>Friday, Jan 1</strong> · Cincinnati departure 4:30–5:30 AM ET
          · Chicago arrival 9–11 AM CT.
        </p>
        <p>
          Budget time for weather, traffic and stops. Check parking and luggage
          drop-off before check-in.
        </p>
        <p>
          <strong>Monday, Jan 4</strong> · Leave Chicago around 5–6 PM CT ·
          Arrive in Cincinnati around midnight–2 AM ET on Jan 5.
        </p>
        <p>
          Check out, arrange luggage storage, and leave time to retrieve bags
          and get to the parking garage.
        </p>
        <Field label="Return departure target (CT)">
          <input
            type="time"
            value={trip.departure}
            onChange={(e) => change('departure', e.target.value)}
          />
        </Field>
      </section>
      <section className="panel">
        <h2>
          <BedDouble size={18} className="inline" /> Hotel and parking
        </h2>
        <p>
          Hotel selection is for planning. Confirm arrangements with the
          property.
        </p>
        <Field label="Hotel">
          <select
            value={trip.hotelId}
            onChange={(e) => {
              const id = e.target.value,
                h = hotels.find((h) => h.id === id)
              update({
                ...trip,
                hotelId: id,
                hotelName: h?.name ?? '',
                address: h?.address ?? '',
              })
            }}
          >
            <option value="">Undecided</option>
            {hotels.map((h) => (
              <option value={h.id} key={h.id}>
                {h.name}
              </option>
            ))}
            <option value="manual">Enter manually</option>
          </select>
        </Field>
        {trip.hotelId === 'manual' && (
          <>
            <Field label="Hotel name">
              <input
                value={trip.hotelName}
                onChange={(e) => change('hotelName', e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Latitude (optional map pin)">
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={trip.hotelLat ?? ''}
                  onChange={(e) =>
                    change(
                      'hotelLat',
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                />
              </Field>
              <Field label="Longitude (optional map pin)">
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={trip.hotelLng ?? ''}
                  onChange={(e) =>
                    change(
                      'hotelLng',
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                />
              </Field>
            </div>
          </>
        )}
        <div className="form-grid">
          <Field label="Address">
            <input
              value={trip.address}
              onChange={(e) => change('address', e.target.value)}
            />
          </Field>
          <Field label="Parking garage and notes">
            <input
              value={trip.parking}
              onChange={(e) => change('parking', e.target.value)}
            />
          </Field>
          <Field label="Check-in (CT)">
            <input
              type="time"
              value={trip.checkin}
              onChange={(e) => change('checkin', e.target.value)}
            />
          </Field>
          <Field label="Checkout (CT)">
            <input
              type="time"
              value={trip.checkout}
              onChange={(e) => change('checkout', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Luggage storage notes">
          <textarea
            value={trip.luggage}
            onChange={(e) => change('luggage', e.target.value)}
          />
        </Field>
        {(hotel || trip.address) && (
          <a
            className="secondary"
            href={
              'https://www.google.com/maps/dir/?api=1&destination=' +
              encodeURIComponent(trip.address || hotel!.address)
            }
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRight size={16} /> Navigate to hotel
          </a>
        )}
      </section>
      <section className="panel">
        <h2>
          <CloudSnow size={18} className="inline" /> Chicago weather now
        </h2>
        {weather?.current ? (
          <>
            <p>
              {Math.round(weather.current.temperature_2m)}°F · Feels like{' '}
              {Math.round(weather.current.apparent_temperature)}°F · Wind{' '}
              {weather.current.wind_speed_10m} mph · Precipitation{' '}
              {weather.current.precipitation} in
            </p>
            <p>
              Next hours:{' '}
              {weather.hourly.time
                .slice(0, 6)
                .map(
                  (t, i) =>
                    t.slice(11) +
                    ' CT ' +
                    Math.round(weather.hourly.temperature_2m[i]) +
                    '°F / ' +
                    weather.hourly.precipitation_probability[i] +
                    '% rain or snow',
                )
                .join(' · ')}
            </p>
          </>
        ) : (
          <p>Current weather is loading or unavailable.</p>
        )}
        <p>
          Official warnings are available from the{' '}
          <a
            className="text-button"
            href="https://www.weather.gov/lot/"
            target="_blank"
            rel="noreferrer"
          >
            National Weather Service <ArrowUpRight size={14} />
          </a>
        </p>
      </section>
      <section className="panel">
        <h2>
          <Footprints size={18} className="inline" /> Preferences
        </h2>
        <div className="form-grid">
          <Field label="Preferred walk">
            <select
              value={trip.preferences.walking}
              onChange={(e) => pref('walking', Number(e.target.value))}
            >
              {times.map((t) => (
                <option value={t} key={t}>
                  {t} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum walk">
            <select
              value={trip.preferences.maxWalking}
              onChange={(e) => pref('maxWalking', Number(e.target.value))}
            >
              {times.map((t) => (
                <option value={t} key={t}>
                  {t} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Travel preference">
            <select
              value={trip.preferences.transport}
              onChange={(e) => pref('transport', e.target.value)}
            >
              <option>Walking</option>
              <option>Public transit</option>
            </select>
          </Field>
          <Field label="Suggest Uber for longer legs">
            <input
              type="checkbox"
              checked={trip.preferences.uber}
              onChange={(e) => pref('uber', e.target.checked)}
            />
          </Field>
          {(
            [
              ['cuisine', 'Favorite cuisines'],
              ['dietary', 'Dietary preferences'],
              ['shopping', 'Shopping interests'],
              ['categories', 'Attraction interests'],
              ['price', 'Price preference'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={trip.preferences[key]}
                onChange={(e) => pref(key, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Indoor/outdoor preference">
            <select
              value={trip.preferences.weather}
              onChange={(e) => pref('weather', e.target.value)}
            >
              <option>Any</option>
              <option>Indoor</option>
              <option>Outdoor</option>
            </select>
          </Field>
        </div>
      </section>
      <button className="secondary" onClick={restore}>
        <RotateCcw size={16} /> Restore original itinerary
      </button>
    </>
  )
}
