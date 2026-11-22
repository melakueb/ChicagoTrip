import {
  Anchor,
  Building2,
  Coffee,
  Landmark,
  MapPin,
  ShoppingBag,
  Utensils,
  Waves,
  Camera,
} from 'lucide-react'
export const categoryIcon = (category: string) =>
  ({
    Architecture: Landmark,
    Shopping: ShoppingBag,
    Coffee: Coffee,
    Restaurants: Utensils,
    Attraction: Camera,
    Museums: Landmark,
  })[category] || MapPin
export const dayIcon = (icon: string) =>
  ({ building: Building2, waves: Waves, lantern: Landmark, anchor: Anchor })[
    icon
  ] || MapPin
export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
