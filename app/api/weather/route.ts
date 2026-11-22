export async function GET() {
  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=41.88&longitude=-87.63&current=temperature_2m,apparent_temperature,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability&forecast_hours=8&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FChicago',
      { next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) },
    )
    if (!response.ok) throw Error()
    return Response.json(await response.json())
  } catch {
    return Response.json({ error: 'Weather unavailable.' }, { status: 502 })
  }
}
