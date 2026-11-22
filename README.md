# Chicago Companion

A mobile-first planner for a Cincinnati-to-Chicago road trip, January 1–4, 2027. The editable itinerary starts in The Loop, then moves to the riverfront and Magnificent Mile, Chinatown, and Navy Pier. Itinerary times use America/Chicago. Driving plans identify the time zone at each end.

## Run locally

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The itinerary, saved places, local discovery, and hotel settings work without credentials. The four candidate hotels are planning options. The application starts with the hotel undecided.

## What works

| Area                                   | Behavior                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agenda                                 | Four editable days, flexible time windows, fixed times, anytime stops, priority, notes, visit status, reordering by drag or menu, moving stops between days, removal with undo, and restore.                                                                                                                                           |
| Saved                                  | Independent saved, starred, and scheduled states. Filters for category, neighborhood, priority, schedule, and visit status.                                                                                                                                                                                                            |
| Maps and discovery without credentials | Interactive coordinate diagram, local catalog, explicit GPS permission, map-point selection, and estimated walking and detour times. The diagram has no street data. The estimates derive from straight-line distance with a walking adjustment and can miss barriers such as the river.                                               |
| Google Maps and live discovery         | Credentialed Maps JavaScript map, Places Text Search (New) and photos, and server-side Routes walking geometry. Live search results show available ratings, opening status and price levels. Regular opening hours provide an estimate for arrival, including on future dates. Confirm holiday exceptions and bookings with the venue. |
| Route suggestions                      | Compares manual and suggested order with local estimates. Suggested order requires approval, preserves fixed and flexible positions, and shows potential conflicts. Discovery requests live route detours only for up to four shortlisted results.                                                                                     |
| Weather                                | Current Chicago observations and short-term forecast from Open-Meteo. The Trip tab links to official weather warnings.                                                                                                                                                                                                                 |
| PWA                                    | Manifest, icons, and a production service worker for offline itinerary access after the first successful online visit. Data stays in this browser. Open the HTTPS deployment in iPhone Safari and choose Share → Add to Home Screen.                                                                                                   |

The local catalog contains curated destinations and public coordinates. It has no simulated hours, ratings, prices, weather observations or routing responses. Where live data is missing, the UI labels unavailable values or identifies coordinate-based estimates. The app can launch external Google Maps directions. Transit routing, automatic official warning feeds, cross-device sync, and native notifications are future work. Long legs may require a different transport mode. Google map tiles and live discovery need connectivity. Location is requested on demand and stays in memory. Live routing or search can send the selected GPS origin to Google.

## Google configuration and costs

1. Copy `.env.example` to `.env.local`.
2. In a billing-enabled Google Cloud project, enable Maps JavaScript API, Places API (New), and Routes API.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_KEY` to a browser key restricted to Maps JavaScript API and your allowed website referrers. Add your local development origin and deployment domain as needed. This value is included in the client bundle.
4. Set `GOOGLE_SERVER_KEY` to a separate credential restricted to Places API (New) and Routes API. Add IP restrictions if your hosting plan provides fixed outbound IPs. Keep it server-side.
5. Restart development or rebuild the deployment after changing the public key.

A map load can incur a Dynamic Maps charge. A settled search uses a Places Text Search request. Requested business details may trigger a higher Places SKU. Displayed live photos may each trigger a photo charge. A route shortlist can use one baseline and up to four candidate calls. Reordering a day can require a new Routes request. The app debounces search, sets result and route caps, and reuses matching routes in a bounded in-memory session cache. Persistent itinerary data omits transient ratings, hours, and photo references.

For a budget estimate, multiply expected monthly map loads, searches, photos, and route calls by the corresponding current SKU prices, after applying any free usage caps. Configure per-API quotas in Google Cloud and budget alerts in Cloud Billing. Budget alerts notify you and quotas bound API usage. The included public endpoints suit a personal deployment. For a wider audience, apply Vercel or upstream rate limits to provider routes. Review Google’s terms for local place storage, branding and attribution before distributing the application. [Google Maps pricing](https://mapsplatform.google.com/pricing/)

## Tests

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_PATH` to use an installed Chromium binary. Mobile Playwright cases run against the production build, exercise key browser flows without API keys, and verify offline reload. Provider tests use controlled responses for missing credentials and failures.

## Vercel

Import this directory as a Next.js project. Add environment variables for each environment where live Google integrations should run. Use the default Next.js build command and a Node.js 22 or newer runtime. Deploy over HTTPS, add the production and preview domains you intend to use to the browser key referrers, and rebuild. Validate the credential-enabled map, nearby search and at least one walking route on the deployed domain. A deployed Vercel project is not included.

## Files by phase

- Agenda and persistence live in `components/companion.tsx` and `lib/{model,seed,planner}.ts`.
- Maps, route data, and local diagrams live in `components/explore.tsx`, `lib/providers.ts`, and `app/api/route/`.
- Live discovery and photos use `app/api/places/` and `app/api/photo/`.
- Suggestions, conflict detection, and weather-aware exploration use the planner, the discovery UI, and `app/api/weather/`.
- Layout and styles live in `app/`, PWA assets in `public/`, and automated verification in `tests/`.
