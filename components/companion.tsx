'use client'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Car,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Ellipsis,
  Footprints,
  GripVertical,
  List,
  Map,
  MapPin,
  Moon,
  Navigation,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Sun,
  X,
} from 'lucide-react'
import type { AgendaEntry, Place, Point, State } from '../lib/model'
import { baseState, catalog, hotels } from '../lib/seed'
import {
  bestIndex,
  chooseNext,
  clock,
  conflicts,
  directions,
  impact,
  key,
  minute,
  persistable,
  putEntry,
  readState,
  remaining,
  removeEntry,
  reorder,
  restore,
  suggested,
  toggleStar,
  travel,
  upsert,
  walk,
} from '../lib/planner'
import { validPoint } from '../lib/providers'
import { categoryIcon, dayIcon, Field } from './ui'
import {
  MapPanel,
  Discover,
  TripPanel,
  useWalking,
  useWeather,
} from './explore'

const tabs = [
  ['Agenda', CalendarDays],
  ['Map', Map],
  ['Discover', Compass],
  ['Saved', Star],
  ['Trip', Car],
] as const
type Tab = (typeof tabs)[number][0]
type Editor = {
  entry: AgendaEntry
  place: Place
  index: number
  adding: boolean
}
type Popup = 'pick' | 'next' | 'route' | 'restore' | null

export default function Companion() {
  const [state, setState] = useState<State>(baseState)
  const [ready, setReady] = useState(false)
  const [dayId, setDay] = useState('1')
  const [tab, setTab] = useState<Tab>('Agenda')
  const [view, setView] = useState('Timeline')
  const [indoorDiscovery, setIndoorDiscovery] = useState(false)
  const [dark, setDark] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [detail, setDetail] = useState<Place | null>(null)
  const [popup, setPopup] = useState<Popup>(null)
  const [menu, setMenu] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All places')
  const [savedCategory, setSavedCategory] = useState('')
  const [savedNeighborhood, setSavedNeighborhood] = useState('')
  const [savedPriority, setSavedPriority] = useState('')
  const [gps, setGps] = useState<Point>()
  const [mapPoint, setMapPoint] = useState<Point>()
  const [locationText, setLocationText] = useState('')
  const [selectedMap, setSelectedMap] = useState<Place>()
  const [toast, setToast] = useState('')
  const [undo, setUndo] = useState<{ entry: AgendaEntry; index: number }>()
  const drag = useRef('')
  const modal = useRef<HTMLDialogElement>(null)
  const day = state.days.find((d) => d.id === dayId)!
  const TripIcon = dayIcon(day.emoji)
  const stops = remaining(day, state.places)
  const hotel =
    hotels.find((h) => h.id === state.trip.hotelId) ??
    (state.trip.hotelId === 'manual' &&
    validPoint({ lat: state.trip.hotelLat!, lng: state.trip.hotelLng! })
      ? {
          id: 'manual-hotel',
          name: state.trip.hotelName || 'Hotel',
          address: state.trip.address,
          lat: state.trip.hotelLat!,
          lng: state.trip.hotelLng!,
          category: 'Hotel',
          neighborhood: 'Chicago',
          setting: 'Indoor' as const,
          notes: state.trip.luggage,
        }
      : undefined)
  const weather = useWeather(
    tab === 'Trip' || tab === 'Discover' || popup === 'next',
  )
  const walking = useWalking(
    stops,
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY),
  )
  const issues = conflicts(day.entries, state.places)
  useEffect(() => {
    try {
      setState(readState(localStorage.getItem(key)))
      setDark(localStorage.getItem('chicago-theme') === 'dark')
    } catch {}
    setReady(true)
    if (process.env.NODE_ENV === 'production')
      navigator.serviceWorker?.register('/sw.js').catch(() => {})
  }, [])
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(key, JSON.stringify(persistable(state)))
        localStorage.setItem('chicago-theme', dark ? 'dark' : 'light')
      } catch {
        setToast('Storage is unavailable. Changes will last for this session.')
      }
  }, [state, ready, dark])
  const modalOpen = Boolean(editor || detail || popup)
  useEffect(() => {
    if (modalOpen && !modal.current?.open) modal.current?.showModal()
    if (!modalOpen && modal.current?.open) modal.current.close()
  }, [modalOpen])
  function close() {
    setEditor(null)
    setDetail(null)
    setPopup(null)
    setQuery('')
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationText('Location is unavailable in this browser.')
      return
    }
    setLocationText('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGps({ lat: coords.latitude, lng: coords.longitude })
        setLocationText('Location found')
      },
      () =>
        setLocationText(
          'Location unavailable. Choose a stop, hotel, or map point.',
        ),
      { timeout: 9000, maximumAge: 60000 },
    )
  }
  function save(place: Place, star = false) {
    setState((old) => {
      const [next, id] = upsert(old, place)
      return star
        ? toggleStar(next, id)
        : {
            ...next,
            saved: {
              ...next.saved,
              [id]: next.saved[id] ?? { placeId: id, starred: false },
            },
          }
    })
  }
  function startAdd(place: Place) {
    const index = bestIndex(
      day.entries.map((e) => state.places[e.placeId]),
      place,
      gps,
    )
    setEditor({
      place,
      index,
      adding: true,
      entry: {
        id: crypto.randomUUID(),
        placeId: place.id,
        dayId,
        mode: 'Anytime',
        start: '',
        end: '',
        duration: 30,
        priority: 'Optional',
        reservation: '',
        status: 'Planned',
        notes: '',
      },
    })
    setDetail(null)
    setPopup(null)
  }
  function edit(entry: AgendaEntry, index: number) {
    setMenu('')
    setEditor({
      entry,
      place: state.places[entry.placeId],
      index,
      adding: false,
    })
  }
  function remove(entry: AgendaEntry, index: number) {
    setState((old) => removeEntry(old, entry.id))
    setUndo({ entry, index })
    setMenu('')
    setToast('Stop removed from your agenda.')
    close()
  }
  function commit(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    const { entry, index, place } = editor
    setState((old) => {
      const [next, id] = upsert(old, place)
      return putEntry(
        {
          ...next,
          saved: {
            ...next.saved,
            [id]: next.saved[id] ?? { placeId: id, starred: false },
          },
        },
        { ...entry, placeId: id },
        index,
      )
    })
    setToast(editor.adding ? 'Stop added to your agenda.' : 'Stop updated.')
    setDay(entry.dayId)
    setTab('Agenda')
    close()
  }
  function status(
    entry: AgendaEntry,
    value: AgendaEntry['status'],
    index: number,
  ) {
    setState((old) => putEntry(old, { ...entry, status: value }, index))
    setMenu('')
  }
  function move(from: number, to: number) {
    setState((old) => reorder(old, dayId, from, to))
  }
  const preview = editor
    ? state.days
        .find((d) => d.id === editor.entry.dayId)!
        .entries.filter((e) => e.id !== editor.entry.id)
    : []
  const tentative = editor
    ? [
        ...preview.slice(0, editor.index),
        editor.entry,
        ...preview.slice(editor.index),
      ]
    : []
  const previewIssues = editor
    ? conflicts(tentative, { ...state.places, [editor.place.id]: editor.place })
    : []
  const proposal = suggested(day.entries, state.places, gps)
  const routeMinutes = (entries: AgendaEntry[]) =>
    entries
      .filter((e) => e.status === 'Planned')
      .reduce(
        (a, e, i, l) =>
          a +
          (i
            ? travel(state.places[l[i - 1].placeId], state.places[e.placeId])
            : gps
              ? travel(gps, state.places[e.placeId])
              : 0),
        0,
      )
  const chicagoDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const chicagoTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
  const nextFixed = day.entries
    .filter((e) => e.mode === 'Fixed time' && e.status === 'Planned')
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const until =
    nextFixed && chicagoDay === day.date
      ? minute(nextFixed.start) - minute(chicagoTime)
      : Infinity
  const candidate = chooseNext(day.entries, state.places, {
    origin: gps,
    now: chicagoDay === day.date ? minute(chicagoTime) : undefined,
    day: new Date(day.date + 'T12:00:00Z').getUTCDay(),
    maxWalk: state.trip.preferences.maxWalking,
    indoors: (weather?.current.apparent_temperature ?? 30) < 25,
  })
  const next = candidate ? state.places[candidate.placeId] : undefined
  function goMap(place: Place) {
    setSelectedMap(place)
    setTab('Map')
    close()
  }
  function card(place: Place, index: number, entry: AgendaEntry) {
    const Icon = categoryIcon(place.category)
    const prior = day.entries
      .slice(0, index)
      .reverse()
      .find((e) => e.status === 'Planned')
    const a = prior && state.places[prior.placeId]
    const live =
      a && walking?.legs.find((l) => l.from === a.id && l.to === place.id)
    const legMinutes = a ? (live?.minutes ?? walk(a, place)) : undefined
    const beyondLimit =
      legMinutes !== undefined &&
      Number.isFinite(legMinutes) &&
      legMinutes > state.trip.preferences.maxWalking
    return (
      <div className="timeline-item" key={entry.id}>
        {view === 'Timeline' && (
          <div className="line-dot">
            <i />
          </div>
        )}
        {view === 'Timeline' &&
          index > 0 &&
          a &&
          entry.status === 'Planned' && (
            <div className="leg">
              <Footprints size={13} />
              {Number.isFinite(legMinutes)
                ? legMinutes + ' min walk' + (live ? '' : ' · estimate')
                : 'Walking time unavailable'}
              {beyondLimit &&
                ' · Consider ' +
                  (state.trip.preferences.uber &&
                  state.trip.preferences.transport === 'Walking'
                    ? 'transit or Uber'
                    : 'transit')}
            </div>
          )}
        <article
          className={'stop ' + (entry.status !== 'Planned' ? 'done' : '')}
          data-stop={entry.id}
          draggable={view === 'List'}
          onDragStart={() => {
            drag.current = entry.id
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag.current)
              move(
                day.entries.findIndex((e) => e.id === drag.current),
                index,
              )
            drag.current = ''
          }}
        >
          {view === 'List' && (
            <button
              className="grip icon"
              aria-label={'Drag ' + place.name}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse') {
                  drag.current = entry.id
                  e.currentTarget.setPointerCapture(e.pointerId)
                }
              }}
              onPointerUp={(e) => {
                if (e.pointerType !== 'mouse') {
                  const id = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest('[data-stop]')
                    ?.getAttribute('data-stop')
                  if (id && drag.current)
                    move(
                      index,
                      day.entries.findIndex((a) => a.id === id),
                    )
                  drag.current = ''
                }
              }}
            >
              <GripVertical size={17} />
            </button>
          )}
          <span className={'place-icon tone-' + (index % 3)}>
            <Icon size={22} />
          </span>
          <div className="stop-body">
            <button className="place-title" onClick={() => setDetail(place)}>
              {place.name}
            </button>
            <div className="meta">
              <span>{place.category}</span>
              <i /> <Clock3 size={13} /> {entry.duration} min <i />{' '}
              {entry.mode === 'Anytime'
                ? 'Anytime'
                : entry.mode === 'Fixed time'
                  ? clock(entry.start)
                  : clock(entry.start) + ' – ' + clock(entry.end)}
            </div>
            <div className="tags">
              <span className={entry.priority === 'Must visit' ? 'must' : ''}>
                {entry.priority}
              </span>
              {entry.status !== 'Planned' && <span>{entry.status}</span>}
              {entry.reservation && <span>Reserved</span>}
            </div>
          </div>
          <div className="stop-actions">
            <button
              className={
                'icon star ' + (state.saved[place.id]?.starred ? 'active' : '')
              }
              aria-label={
                (state.saved[place.id]?.starred ? 'Unstar ' : 'Star ') +
                place.name
              }
              onClick={() => save(place, true)}
            >
              <Star size={19} />
            </button>
            <div className="menu-wrap">
              <button
                className="icon"
                aria-label={'Actions for ' + place.name}
                aria-expanded={menu === entry.id}
                onClick={() => setMenu(menu === entry.id ? '' : entry.id)}
              >
                <Ellipsis size={21} />
              </button>
              {menu === entry.id && (
                <div className="menu">
                  <button onClick={() => edit(entry, index)}>
                    Edit stop / move day
                  </button>
                  <button
                    onClick={() =>
                      status(
                        entry,
                        entry.status === 'Visited' ? 'Planned' : 'Visited',
                        index,
                      )
                    }
                  >
                    Mark {entry.status === 'Visited' ? 'planned' : 'visited'}
                  </button>
                  <button
                    onClick={() =>
                      status(
                        entry,
                        entry.status === 'Skipped' ? 'Planned' : 'Skipped',
                        index,
                      )
                    }
                  >
                    Mark {entry.status === 'Skipped' ? 'planned' : 'skipped'}
                  </button>
                  <button
                    disabled={!index}
                    onClick={() => {
                      move(index, index - 1)
                      setMenu('')
                    }}
                  >
                    <ArrowUp size={14} /> Move up
                  </button>
                  <button
                    disabled={index === day.entries.length - 1}
                    onClick={() => {
                      move(index, index + 1)
                      setMenu('')
                    }}
                  >
                    <ArrowDown size={14} /> Move down
                  </button>
                  <button
                    className="danger"
                    onClick={() => remove(entry, index)}
                  >
                    Remove stop
                  </button>
                </div>
              )}
            </div>
          </div>
        </article>
      </div>
    )
  }
  const shared = {
    day,
    state,
    gps,
    hotel,
    walking,
    selected: selectedMap,
    setPoint: setMapPoint,
    onPlace: setDetail,
    locate,
    locationText,
  }
  return (
    <div className={'site ' + (dark ? 'dark' : '')}>
      <header className="top">
        <div className="shell top-inner">
          <button className="brand" onClick={() => setTab('Agenda')}>
            <span className="brand-icon">
              <Compass size={22} />
            </span>
            <span>
              Chicago<span className="brand-secondary"> Companion</span>
              <small>YOUR PERSONAL TRIP PLANNER</small>
            </span>
          </button>
          <div className="top-actions">
            <span className="trip-date">
              <CalendarDays size={15} /> Jan 1–4, 2027
            </span>
            <button
              className="icon theme"
              aria-label={dark ? 'Light mode' : 'Dark mode'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      <main className="shell main">
        {tab === 'Agenda' && (
          <>
            <section className="hero">
              <div className="hero-content">
                <span className="hero-label">
                  <MapPin size={13} /> CHICAGO, ILLINOIS
                </span>
                <h1>Chicago Getaway</h1>
                <p>
                  January 1–4, 2027 <b>·</b> Cincinnati <span>→</span> Chicago
                </p>
              </div>
              <button className="next-button" onClick={() => setPopup('next')}>
                <Sparkles size={17} /> Where to next? <ChevronRight size={17} />
              </button>
            </section>
            <div className="day-selector" aria-label="Choose agenda date">
              {state.days.map((d) => (
                <button
                  key={d.id}
                  aria-pressed={d.id === dayId}
                  className={d.id === dayId ? 'selected' : ''}
                  onClick={() => {
                    setDay(d.id)
                    setMenu('')
                    setSelectedMap(undefined)
                  }}
                >
                  <span>{d.weekday.slice(0, 3).toUpperCase()}</span>
                  <strong>Jan {d.id}</strong>
                  <small>Day {d.id}</small>
                </button>
              ))}
            </div>
            <div className="agenda-head">
              <div className="day-heading">
                <span className="day-icon">
                  <TripIcon size={25} />
                </span>
                <div>
                  <div className="eyebrow">
                    DAY {day.id} <span>•</span> {day.weekday.toUpperCase()}
                  </div>
                  <h2>{day.theme}</h2>
                </div>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setQuery('')
                  setPopup('pick')
                }}
              >
                <Plus size={17} /> Add stop
              </button>
            </div>
            <p className="day-description">{day.description}</p>
            <div className="viewbar">
              <div className="segmented" aria-label="Agenda view">
                {(
                  [
                    ['Timeline', Clock3],
                    ['List', List],
                    ['Map', Map],
                  ] as const
                ).map(([name, Icon]) => (
                  <button
                    key={name}
                    className={view === name ? 'on' : ''}
                    aria-pressed={view === name}
                    onClick={() => setView(name)}
                  >
                    <Icon size={15} /> {name}
                  </button>
                ))}
              </div>
              <button
                className="text-button route-action"
                onClick={() => setPopup('route')}
              >
                <Navigation size={15} /> Suggested route
              </button>
            </div>
            <div className="section-label">
              <h3>{view === 'Map' ? 'Day route' : 'Planned stops'}</h3>
              <span>
                {day.entries.length}{' '}
                {day.entries.length === 1 ? 'stop' : 'stops'} <b>·</b> Chicago
                time (CT)
              </span>
            </div>
            {issues.map((i) => (
              <p className="warning" key={i}>
                {i}
              </p>
            ))}
            {view === 'Map' ? (
              <MapPanel {...shared} />
            ) : (
              <div className={view === 'Timeline' ? 'timeline' : ''}>
                {day.entries.map((e, i) => card(state.places[e.placeId], i, e))}
                {!day.entries.length && (
                  <p className="empty">
                    Add a stop to start planning this day.
                  </p>
                )}
              </div>
            )}
            <div className="flex-note">
              <Coffee size={19} />
              <div>
                <strong>Keep some time flexible</strong>
                <p>{day.window}</p>
              </div>
            </div>
            <div className="section-label">
              <h3>Optional nearby</h3>
              <button
                className="text-button"
                onClick={() => setTab('Discover')}
              >
                Explore more <ChevronRight size={15} />
              </button>
            </div>
            <div className="nearby-grid">
              {catalog
                .filter(
                  (p) =>
                    (p.neighborhood === day.neighborhood ||
                      (dayId === '2' &&
                        ['River North', 'Magnificent Mile'].includes(
                          p.neighborhood,
                        ))) &&
                    !day.entries.some((e) => e.placeId === p.id),
                )
                .slice(0, 3)
                .map((p) => (
                  <button
                    className="nearby"
                    key={p.id}
                    onClick={() => setDetail(p)}
                  >
                    <MapPin size={16} />
                    <span>
                      {p.name}
                      <small>{p.category}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
            </div>
          </>
        )}
        {tab === 'Map' && (
          <>
            <div className="page-title">
              <span className="eyebrow">CHICAGO, ILLINOIS</span>
              <h1>Trip map</h1>
              <p>Follow your itinerary or explore nearby places.</p>
              <select
                aria-label="Map day"
                value={dayId}
                onChange={(e) => {
                  setDay(e.target.value)
                  setSelectedMap(undefined)
                }}
              >
                {state.days.map((d) => (
                  <option key={d.id} value={d.id}>
                    Jan {d.id} · {d.neighborhood}
                  </option>
                ))}
              </select>
            </div>
            <MapPanel {...shared} />
          </>
        )}
        {tab === 'Discover' && (
          <Discover
            {...shared}
            mapPoint={mapPoint}
            weather={weather}
            initialIndoor={indoorDiscovery}
            onAdd={startAdd}
            onStar={(p) => save(p, true)}
            onSave={save}
          />
        )}
        {tab === 'Saved' && (
          <>
            <div className="page-title">
              <span className="eyebrow">YOUR COLLECTION</span>
              <h1>Saved places</h1>
              <p>Keep track of favorites and places to visit later.</p>
            </div>
            <div className="chips">
              {[
                'All places',
                'Starred',
                'Unscheduled',
                'Scheduled',
                'Visited',
              ].map((f) => (
                <button
                  className={filter === f ? 'on' : ''}
                  onClick={() => setFilter(f)}
                  key={f}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="form-grid saved-filters">
              <select
                aria-label="Saved category"
                value={savedCategory}
                onChange={(e) => setSavedCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {[
                  ...new Set(
                    Object.values(state.places).map((p) => p.category),
                  ),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                aria-label="Saved neighborhood"
                value={savedNeighborhood}
                onChange={(e) => setSavedNeighborhood(e.target.value)}
              >
                <option value="">All neighborhoods</option>
                {[
                  ...new Set(
                    Object.values(state.places).map((p) => p.neighborhood),
                  ),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                aria-label="Saved priority"
                value={savedPriority}
                onChange={(e) => setSavedPriority(e.target.value)}
              >
                <option value="">Any priority</option>
                {['Must visit', 'Recommended', 'Optional'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="collection">
              {Object.values(state.saved)
                .filter((f) => {
                  const p = state.places[f.placeId],
                    entries = state.days
                      .flatMap((d) => d.entries)
                      .filter((e) => e.placeId === f.placeId)
                  return (
                    (!savedCategory || p.category === savedCategory) &&
                    (!savedNeighborhood ||
                      p.neighborhood === savedNeighborhood) &&
                    (!savedPriority ||
                      entries.some((e) => e.priority === savedPriority)) &&
                    (filter === 'All places' ||
                      (filter === 'Starred' && f.starred) ||
                      (filter === 'Unscheduled' && !entries.length) ||
                      (filter === 'Scheduled' && entries.length) ||
                      (filter === 'Visited' &&
                        entries.some((e) => e.status === 'Visited')))
                  )
                })
                .map((f) => {
                  const p = state.places[f.placeId],
                    Icon = categoryIcon(p.category)
                  return (
                    <article className="nearby" key={p.id}>
                      <span className="place-icon">
                        <Icon size={19} />
                      </span>
                      <button
                        className="place-title grow"
                        onClick={() => setDetail(p)}
                      >
                        {p.name}
                        <small>
                          {p.category} · {p.neighborhood}
                        </small>
                      </button>
                      <button
                        className={'icon star ' + (f.starred ? 'active' : '')}
                        aria-label={(f.starred ? 'Unstar ' : 'Star ') + p.name}
                        onClick={() => save(p, true)}
                      >
                        <Star size={18} />
                      </button>
                      <button
                        className="icon"
                        aria-label={'Add ' + p.name}
                        onClick={() => startAdd(p)}
                      >
                        <Plus size={19} />
                      </button>
                    </article>
                  )
                })}
            </div>
          </>
        )}
        {tab === 'Trip' && (
          <TripPanel
            trip={state.trip}
            update={(trip) => setState((old) => ({ ...old, trip }))}
            weather={weather}
            restore={() => setPopup('restore')}
          />
        )}
      </main>
      <nav className="bottom" aria-label="Primary">
        <div className="shell nav-inner">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              aria-current={tab === name ? 'page' : undefined}
              className={tab === name ? 'current' : ''}
              onClick={() => {
                setTab(name)
                setMenu('')
                if (name === 'Discover') setIndoorDiscovery(false)
              }}
            >
              <span>
                <Icon size={21} />
              </span>
              {name}
            </button>
          ))}
        </div>
      </nav>
      {toast && (
        <div className="toast" role="status">
          {toast}
          {undo && toast.startsWith('Stop removed') && (
            <button
              onClick={() => {
                setState((old) => putEntry(old, undo.entry, undo.index))
                setUndo(undefined)
                setToast('Stop restored.')
              }}
            >
              Undo
            </button>
          )}
          <button
            className="icon"
            aria-label="Dismiss message"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        ref={modal}
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          if (e.target === modal.current) close()
        }}
        aria-label={
          editor ? 'Edit agenda stop' : detail?.name || popup || 'Trip options'
        }
      >
        {modalOpen && (
          <div className="dialog-body">
            <button
              className="icon close"
              aria-label="Close dialog"
              onClick={close}
            >
              <X size={21} />
            </button>
            {popup === 'pick' && (
              <>
                <h2>Add a stop</h2>
                <p>Choose a Chicago destination or add your own.</p>
                <input
                  aria-label="Find a place"
                  placeholder="Search places or enter a name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="picker">
                  {Object.values(state.places)
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.trim().toLowerCase()),
                    )
                    .map((p) => (
                      <button key={p.id} onClick={() => startAdd(p)}>
                        <MapPin size={17} />
                        <span>
                          {p.name}
                          <small>{p.neighborhood}</small>
                        </span>
                        <Plus size={16} />
                      </button>
                    ))}
                </div>
                {query.trim() &&
                  !Object.values(state.places).some(
                    (p) => p.name.toLowerCase() === query.trim().toLowerCase(),
                  ) && (
                    <button
                      className="primary"
                      onClick={() =>
                        startAdd({
                          id: crypto.randomUUID(),
                          name: query.trim(),
                          address: '',
                          category: 'Custom',
                          neighborhood: day.neighborhood,
                          setting: 'Mixed',
                          lat: NaN,
                          lng: NaN,
                          notes: '',
                        })
                      }
                    >
                      <Plus size={16} /> Add “{query.trim()}”
                    </button>
                  )}
              </>
            )}
            {editor && (
              <>
                <h2>{editor.adding ? 'Add to agenda' : 'Edit stop'}</h2>
                <p>{editor.place.name}</p>
                <form onSubmit={commit}>
                  <div className="form-grid">
                    <Field label="Day">
                      <select
                        value={editor.entry.dayId}
                        onChange={(e) => {
                          const id = e.target.value
                          setEditor({
                            ...editor,
                            entry: { ...editor.entry, dayId: id },
                            index: bestIndex(
                              state.days
                                .find((d) => d.id === id)!
                                .entries.map((a) => state.places[a.placeId]),
                              editor.place,
                              gps,
                            ),
                          })
                        }}
                      >
                        {state.days.map((d) => (
                          <option key={d.id} value={d.id}>
                            Jan {d.id} · {d.neighborhood}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Position">
                      <select
                        value={editor.index}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            index: Number(e.target.value),
                          })
                        }
                      >
                        <option value={0}>First stop</option>
                        {preview.map((a, i) => (
                          <option key={a.id} value={i + 1}>
                            After {state.places[a.placeId].name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {editor.place.category === 'Custom' && (
                      <Field label="Address">
                        <input
                          value={editor.place.address}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              place: {
                                ...editor.place,
                                address: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    )}
                    <Field label="Scheduling mode">
                      <select
                        value={editor.entry.mode}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            entry: {
                              ...editor.entry,
                              mode: e.target.value as AgendaEntry['mode'],
                              reservation:
                                e.target.value === 'Fixed time'
                                  ? editor.entry.reservation
                                  : '',
                            },
                          })
                        }
                      >
                        {['Anytime', 'Flexible window', 'Fixed time'].map(
                          (m) => (
                            <option key={m}>{m}</option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Duration (minutes)">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        required
                        value={editor.entry.duration}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            entry: {
                              ...editor.entry,
                              duration: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </Field>
                    {editor.entry.mode !== 'Anytime' && (
                      <Field label="Start time (CT)">
                        <input
                          type="time"
                          required
                          value={editor.entry.start}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              entry: { ...editor.entry, start: e.target.value },
                            })
                          }
                        />
                      </Field>
                    )}
                    {editor.entry.mode === 'Flexible window' && (
                      <Field label="Window ends (CT)">
                        <input
                          type="time"
                          min={editor.entry.start}
                          required
                          value={editor.entry.end}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              entry: { ...editor.entry, end: e.target.value },
                            })
                          }
                        />
                      </Field>
                    )}
                    <Field label="Priority">
                      <select
                        value={editor.entry.priority}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            entry: {
                              ...editor.entry,
                              priority: e.target
                                .value as AgendaEntry['priority'],
                            },
                          })
                        }
                      >
                        {['Must visit', 'Recommended', 'Optional'].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </Field>
                    {editor.entry.mode === 'Fixed time' && (
                      <Field label="Reservation confirmation">
                        <input
                          value={editor.entry.reservation}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              entry: {
                                ...editor.entry,
                                reservation: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <Field label="Notes">
                    <textarea
                      value={editor.entry.notes}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          entry: { ...editor.entry, notes: e.target.value },
                        })
                      }
                    />
                  </Field>
                  {editor.adding && (
                    <p className="flex-note">
                      {validPoint(editor.place)
                        ? 'Estimated route impact: ' +
                          impact(
                            preview.map((e) => state.places[e.placeId]),
                            editor.place,
                            editor.index,
                            gps,
                          ) +
                          ' min additional walking'
                        : 'Route impact unavailable for this address.'}
                    </p>
                  )}
                  {previewIssues.map((i) => (
                    <p className="warning" key={i}>
                      {i}
                    </p>
                  ))}
                  <button className="primary" type="submit">
                    <Check size={17} />{' '}
                    {editor.adding ? 'Add stop' : 'Save changes'}
                  </button>
                </form>
              </>
            )}
            {detail && (
              <>
                <span className="eyebrow">
                  {detail.category} · {detail.neighborhood}
                </span>
                <h2>{detail.name}</h2>
                <p className="meta">
                  <MapPin size={15} />
                  {detail.address || 'Address unavailable'}
                </p>
                {validPoint(detail) && (
                  <p>
                    {gps &&
                      walk(gps, detail) + ' min walk from your location · '}
                    {impact(stops, detail, bestIndex(stops, detail, gps), gps)}{' '}
                    min estimated added walking in the best position
                  </p>
                )}
                <p>
                  {detail.notes ||
                    'Explore this place during your Chicago trip.'}
                </p>
                <p>
                  {detail.open === undefined
                    ? 'Live hours unavailable'
                    : detail.open
                      ? 'Open now'
                      : 'Closed now'}
                  {detail.rating && ' · ' + detail.rating + ' ★'}
                  {detail.reviews && ' (' + detail.reviews + ' reviews)'}
                  {detail.price && ' · ' + detail.price}
                </p>
                <p>
                  {state.saved[detail.id] ? 'Saved place' : 'New discovery'}
                  {state.saved[detail.id]?.starred ? ' · Starred' : ''}
                </p>
                {state.days.flatMap((d) =>
                  d.entries
                    .filter((e) => e.placeId === detail.id)
                    .map((e) => (
                      <p key={e.id}>
                        Jan {d.id} · {e.status}
                        {e.notes && ' · ' + e.notes}{' '}
                        <button
                          className="text-button"
                          onClick={() => {
                            setDetail(null)
                            edit(e, d.entries.indexOf(e))
                          }}
                        >
                          Edit
                        </button>
                      </p>
                    )),
                )}
                <div className="button-row">
                  <button className="primary" onClick={() => startAdd(detail)}>
                    <Plus size={17} /> Add to agenda
                  </button>
                  <button
                    className="secondary"
                    onClick={() => save(detail, true)}
                  >
                    <Star size={16} />{' '}
                    {state.saved[detail.id]?.starred
                      ? 'Unstar'
                      : 'Star for later'}
                  </button>
                  <button className="secondary" onClick={() => goMap(detail)}>
                    <Map size={16} /> View on map
                  </button>
                  <a
                    className="secondary"
                    href={directions(detail)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={16} /> Directions
                  </a>
                </div>
              </>
            )}
            {popup === 'next' && (
              <>
                <span className="eyebrow">
                  JAN {day.id} · {day.neighborhood}
                </span>
                <h2>Where to next?</h2>
                {next ? (
                  <>
                    <p className="next-place">{next.name}</p>
                    <p>{next.notes || 'This is your next planned stop.'}</p>
                    <p>
                      {gps && Number.isFinite(next.lat)
                        ? 'About ' +
                          walk(gps, next) +
                          ' min walking (estimate).'
                        : 'Enable location for a walking estimate.'}{' '}
                      {next.open === false
                        ? 'Reported closed now.'
                        : next.open === true
                          ? 'Reported open now.'
                          : 'Confirm opening hours before setting out.'}
                    </p>
                    <div className="button-row">
                      <button
                        className="primary"
                        onClick={() => {
                          setPopup(null)
                          setDetail(next)
                        }}
                      >
                        View stop <ChevronRight size={16} />
                      </button>
                      <button className="secondary" onClick={locate}>
                        <Navigation size={16} /> Use my location
                      </button>
                    </div>
                    {locationText && <p role="status">{locationText}</p>}
                  </>
                ) : (
                  <p>
                    {stops.length
                      ? 'No remaining stop fits the current time and known hours. Review your agenda or explore nearby alternatives.'
                      : 'You’re through the planned stops for this day.'}
                  </p>
                )}
                {nextFixed && (
                  <p className="warning">
                    Fixed stop: {state.places[nextFixed.placeId].name} at{' '}
                    {clock(nextFixed.start)} CT.{' '}
                    {until < 0 ? 'Its start time has passed.' : ''}
                  </p>
                )}
                {weather?.current && (
                  <p>
                    Chicago now · Feels like{' '}
                    {Math.round(weather.current.apparent_temperature)}°F
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    setIndoorDiscovery(true)
                    setTab('Discover')
                    close()
                  }}
                >
                  Find indoor alternatives <ChevronRight size={15} />
                </button>
              </>
            )}
            {popup === 'route' && (
              <>
                <h2>Suggested route</h2>
                <p>
                  Estimates use local coordinates. Fixed times and flexible
                  windows keep their positions.
                </p>
                <div className="form-grid">
                  {[
                    ['My schedule', day.entries],
                    ['Suggested route', proposal],
                  ].map(([label, list]) => (
                    <div key={label as string}>
                      <strong>{label as string}</strong>
                      <ol>
                        {(list as AgendaEntry[]).map((e) => (
                          <li key={e.id}>{state.places[e.placeId].name}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
                <p>
                  {routeMinutes(day.entries)} min → {routeMinutes(proposal)} min
                  estimated walking ·{' '}
                  {Math.max(
                    0,
                    routeMinutes(day.entries) - routeMinutes(proposal),
                  )}{' '}
                  min savings
                </p>
                {conflicts(proposal, state.places).map((i) => (
                  <p className="warning" key={i}>
                    {i}
                  </p>
                ))}
                <button
                  className="primary"
                  disabled={routeMinutes(proposal) >= routeMinutes(day.entries)}
                  onClick={() => {
                    setState((old) => ({
                      ...old,
                      days: old.days.map((d) =>
                        d.id === dayId ? { ...d, entries: proposal } : d,
                      ),
                    }))
                    close()
                    setToast('Suggested order applied.')
                  }}
                >
                  Apply suggested order
                </button>
              </>
            )}
            {popup === 'restore' && (
              <>
                <h2>Restore original itinerary?</h2>
                <p>
                  This replaces your agenda edits across all four days. Your
                  saved places and trip settings stay available.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setState(restore)
                    setUndo(undefined)
                    close()
                    setToast('Original itinerary restored.')
                  }}
                >
                  <RotateCcw size={16} /> Restore itinerary
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  )
}
