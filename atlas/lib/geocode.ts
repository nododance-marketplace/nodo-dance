/**
 * Geocoding for Atlas.
 *
 * Uses OpenStreetMap Nominatim (no API key) with:
 *  - a persistent disk cache (geocoding is deterministic for a given address)
 *  - a hard 1 request/second limit, per Nominatim's usage policy
 *  - a descriptive User-Agent, as their policy requires
 *
 * The existing app has no geocode cache; this adds one for the ingestion path
 * without touching the public submission path.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeAddress } from './normalize'

const CACHE_DIR = resolve(__dirname, '..', '..', '.cache', 'geocode')
const CACHE_FILE = resolve(CACHE_DIR, 'nominatim.json')
const MIN_INTERVAL_MS = 1100

export interface GeoResult {
  lat: number
  lng: number
  displayName?: string
  cached: boolean
}

interface GeoCache {
  [key: string]: { lat: number; lng: number; displayName?: string }
}

export class Geocoder {
  private cache: GeoCache = {}
  private lastCall = 0
  private loaded = false

  constructor(private userAgent = 'NodoAtlasBot/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com)') {
    if (existsSync(CACHE_FILE)) {
      try {
        this.cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
        this.loaded = true
      } catch {
        this.cache = {}
      }
    }
  }

  private persist(): void {
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
      writeFileSync(CACHE_FILE, JSON.stringify(this.cache), 'utf8')
    } catch {
      /* cache is best-effort */
    }
  }

  async geocode(address: string, city?: string, state?: string): Promise<GeoResult | null> {
    const query = normalizeAddress([address, city, state].filter(Boolean).join(', '))
    if (!query) return null
    const cached = this.cache[query]
    if (cached) return { ...cached, cached: true }

    // Nominatim requires <= 1 request/second.
    const wait = MIN_INTERVAL_MS - (Date.now() - this.lastCall)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.lastCall = Date.now()

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' } })
      if (!res.ok) return null
      const json = (await res.json()) as any[]
      const hit = json?.[0]
      if (!hit) return null
      const result = {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        displayName: hit.display_name,
      }
      this.cache[query] = result
      this.persist()
      return { ...result, cached: false }
    } catch {
      return null
    }
  }

  get size(): number {
    return Object.keys(this.cache).length
  }
}
