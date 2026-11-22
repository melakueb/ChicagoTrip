import test from 'node:test'
import assert from 'node:assert/strict'
import { POST as route } from '../app/api/route/route'
import { POST as places } from '../app/api/places/route'
const point = { id: 'a', lat: 41.88, lng: -87.62 }
const req = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body),
  })
test('unconfigured services return searchable fallback errors', async () => {
  const before = process.env.GOOGLE_SERVER_KEY
  delete process.env.GOOGLE_SERVER_KEY
  try {
    assert.equal((await route(req({ points: [point, point] }))).status, 503)
    assert.equal(
      (await places(req({ query: 'bakery', origin: point }))).status,
      503,
    )
  } finally {
    if (before !== undefined) process.env.GOOGLE_SERVER_KEY = before
  }
})
test('failed Places requests and missing Routes legs return 502', async (t) => {
  const before = process.env.GOOGLE_SERVER_KEY
  process.env.GOOGLE_SERVER_KEY = 'test-key'
  try {
    const mock = t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(null, { status: 429 }),
    )
    assert.equal(
      (await places(req({ query: 'bakery', origin: point }))).status,
      502,
    )
    mock.mock.mockImplementation(async () =>
      Response.json({ routes: [{ legs: [] }] }),
    )
    assert.equal(
      (await route(req({ points: [point, { ...point, id: 'b' }] }))).status,
      502,
    )
    assert.equal(
      (await route(req({ points: [point, { ...point, lat: 100 }] }))).status,
      400,
    )
  } finally {
    if (before === undefined) delete process.env.GOOGLE_SERVER_KEY
    else process.env.GOOGLE_SERVER_KEY = before
  }
})

test('weather forwards available observations and handles provider outages', async (t) => {
  const { GET: weather } = await import('../app/api/weather/route')
  const forecast = {
    current: { temperature_2m: 26 },
    hourly: { time: ['2027-01-01T09:00'] },
  }
  const mock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json(forecast),
  )
  assert.deepEqual(await (await weather()).json(), forecast)
  mock.mock.mockImplementation(async () => new Response(null, { status: 503 }))
  assert.equal((await weather()).status, 502)
})
