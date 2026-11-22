import test from 'node:test'
import assert from 'node:assert/strict'
import { baseState } from '../lib/seed'
import {
  bestIndex,
  chooseNext,
  conflicts,
  openingAt,
  persistable,
  putEntry,
  readState,
  remaining,
  removeEntry,
  reorder,
  restore,
  suggested,
  toggleStar,
  upsert,
} from '../lib/planner'
import { decode, validPoint } from '../lib/providers'
import type { AgendaEntry } from '../lib/model'
const fresh = () => structuredClone(baseState)
test('add, remove, undo, and restore preserve saved places', () => {
  const state = fresh(),
    entry = { ...state.days[0].entries[0], id: 'new', placeId: 'theatre' }
  const added = putEntry(state, entry, 1)
  assert.equal(added.days[0].entries[1].placeId, 'theatre')
  const removed = removeEntry(added, 'new')
  assert.ok(removed.saved.theatre)
  assert.deepEqual(putEntry(removed, entry, 1), added)
  assert.deepEqual(restore(added).days, state.days)
})
test('stars toggle independently of the schedule and survive serialization', () => {
  const state = fresh()
  const starred = toggleStar(state, 'theatre')
  assert.equal(
    readState(JSON.stringify(persistable(starred))).saved.theatre.starred,
    true,
  )
  assert.equal(toggleStar(starred, 'theatre').saved.theatre.starred, false)
  assert.deepEqual(starred.days, state.days)
  assert.deepEqual(readState('corrupt').days, state.days)
})
test('an edited reservation moves days without duplicating or being changed by optimization', () => {
  const state = fresh()
  const entry: AgendaEntry = {
    ...state.days[0].entries[0],
    dayId: '2',
    mode: 'Fixed time',
    start: '11:00',
    reservation: 'BOOKED',
  }
  const moved = putEntry(state, entry, 1)
  assert.equal(moved.days[0].entries.length, 2)
  assert.equal(moved.days[1].entries[1].start, '11:00')
  assert.deepEqual(suggested(moved.days[1].entries, state.places)[1], entry)
})
test('route follows reorder and omits visited or skipped places', () => {
  const state = fresh()
  const changed = reorder(state, '1', 0, 2)
  assert.deepEqual(
    remaining(changed.days[0], state.places).map((p) => p.id),
    ['cultural', 'primark', 'millennium'],
  )
  const first = changed.days[0].entries[0]
  assert.deepEqual(
    remaining(
      putEntry(changed, { ...first, status: 'Skipped' }, 0).days[0],
      state.places,
    ).map((p) => p.id),
    ['primark', 'millennium'],
  )
  assert.equal(bestIndex([state.places.square], state.places.chiu), 1)
})
test('overlapping fixed times and too-short windows produce warnings', () => {
  const state = fresh()
  const entries = state.days[0].entries
  const issues = conflicts(
    entries.map((e, i) => ({
      ...e,
      mode: i === 2 ? 'Flexible window' : 'Fixed time',
      start: i === 2 ? '15:00' : '11:00',
      end: '15:10',
    })),
    state.places,
  )
  assert.equal(issues.length, 2)
})
test('duplicate Google matches keep the existing internal ID and live fields are session only', () => {
  const state = fresh(),
    place = {
      ...state.places.theatre,
      id: 'g-theatre',
      googleId: 'theatre-google',
      rating: 4.5,
    }
  const [updated, id] = upsert(state, place)
  assert.equal(id, 'theatre')
  assert.equal(updated.places[id].googleId, 'theatre-google')
  assert.equal(persistable(updated).places[id].rating, undefined)
  assert.equal(
    Object.keys(updated.places).length,
    Object.keys(state.places).length,
  )
})
test('hours remain unknown when unavailable, and Saturday overnight hours cross into Sunday', () => {
  const place = fresh().places.square
  assert.equal(openingAt(place, 0, 60), undefined)
  assert.equal(
    openingAt(
      {
        ...place,
        periods: [{ open: { day: 6, hour: 22 }, close: { day: 0, hour: 2 } }],
      },
      0,
      60,
    ),
    true,
  )
})
test('where next protects an upcoming reservation', () => {
  const state = fresh(),
    [first, second] = state.days[0].entries
  const booked: AgendaEntry = { ...second, mode: 'Fixed time', start: '11:00' }
  assert.equal(
    chooseNext([first, booked], state.places, {
      now: 640,
      day: 5,
      maxWalk: 25,
      indoors: false,
    })?.id,
    booked.id,
  )
})
test('invalid coordinates and truncated route shapes are detected', () => {
  assert.equal(validPoint({ lat: NaN, lng: -87 }), false)
  assert.throws(() => decode('_'))
  assert.deepEqual(decode('_p~iF~ps|U')[0], { lat: 38.5, lng: -120.2 })
})
