export async function GET(req: Request) {
  const key = process.env.GOOGLE_SERVER_KEY
  const name = new URL(req.url).searchParams.get('name')
  if (!key || !name || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name))
    return new Response(null, { status: 404 })
  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/' + name + '/media?maxWidthPx=320',
      {
        headers: { 'X-Goog-Api-Key': key },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!response.ok) return new Response(null, { status: 502 })
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response(null, { status: 502 })
  }
}
