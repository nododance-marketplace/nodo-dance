import { parseJsonArray } from '@/lib/utils'

/** Canonical dance style color palette — single source of truth */
export const DANCE_STYLE_COLORS: Record<string, string> = {
  Salsa: '#E85D5D',
  Bachata: '#F4A261',
  Kizomba: '#6C63FF',
  Tango: '#2F3E46',
  Zouk: '#00B4D8',
  Other: '#9CA3AF',
}

/** Resolve the primary style color hex from a JSON styles string */
export function getStyleColor(styles: string): string {
  const arr = parseJsonArray(styles)
  const primary = arr[0]?.trim() || 'Other'
  return DANCE_STYLE_COLORS[primary] || DANCE_STYLE_COLORS.Other
}

/** Resolve the primary style name from a JSON styles string */
export function getPrimaryStyle(styles: string): string {
  const arr = parseJsonArray(styles)
  return arr[0]?.trim() || 'Other'
}

/** Convert hex to rgba for transparent backgrounds */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
