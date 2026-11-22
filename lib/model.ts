export type Point = { lat: number; lng: number }
export type Place = Point & {
  id: string
  googleId?: string
  name: string
  address: string
  neighborhood: string
  category: string
  setting: 'Indoor' | 'Outdoor' | 'Mixed'
  notes: string
  rating?: number
  reviews?: number
  price?: string
  open?: boolean
  periods?: {
    open: { day: number; hour?: number; minute?: number }
    close?: { day: number; hour?: number; minute?: number }
  }[]
  photo?: string
  photoAuthors?: { displayName: string; uri?: string }[]
}
export type Priority = 'Must visit' | 'Recommended' | 'Optional'
export type AgendaEntry = {
  id: string
  placeId: string
  dayId: string
  mode: 'Anytime' | 'Flexible window' | 'Fixed time'
  start: string
  end: string
  duration: number
  priority: Priority
  reservation: string
  status: 'Planned' | 'Visited' | 'Skipped'
  notes: string
}
export type DayPlan = {
  id: string
  date: string
  weekday: string
  neighborhood: string
  theme: string
  description: string
  emoji: string
  window: string
  entries: AgendaEntry[]
}
export type Favorite = { placeId: string; starred: boolean }
export type UserPreferences = {
  walking: number
  maxWalking: number
  radius: number
  price: string
  categories: string
  weather: string
  cuisine: string
  dietary: string
  shopping: string
  transport: string
  uber: boolean
}
export type Reservation = {
  placeId: string
  date: string
  start: string
  duration: number
  confirmation: string
  reference?: string
}
export type DiscoveryResult = {
  place: Place
  origin: Point
  walking: number | null
  detour: number | null
  open: boolean | undefined
  score: number
}
export type Trip = {
  id: string
  name: string
  destination: string
  start: string
  end: string
  timezone: string
  hotelId: string
  hotelName: string
  address: string
  hotelLat?: number
  hotelLng?: number
  parking: string
  checkin: string
  checkout: string
  luggage: string
  departure: string
  preferences: UserPreferences
}
export type State = {
  days: DayPlan[]
  places: Record<string, Place>
  saved: Record<string, Favorite>
  trip: Trip
}
