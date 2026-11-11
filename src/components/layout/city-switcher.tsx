'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MapPin, ChevronDown, Check } from 'lucide-react'

interface MarketSummary {
  slug: string
  name: string
  state: string
  label: string
  tagline: string
  events: number
}

interface MarketList {
  markets: MarketSummary[]
  total: number
}

/**
 * The market switcher.
 *
 * Nodo serves several cities now. The chosen market is kept in the URL, so
 * a link to an event or a filtered list can be shared and still lands on
 * the right city.
 */
export function CitySwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MarketList | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // The market can also come from a landing page URL: /cities/austin
  const fromPath = pathname.startsWith('/cities/') ? pathname.split('/')[2] : null
  const current = searchParams.get('market') || fromPath || 'all'

  useEffect(() => {
    let cancelled = false
    fetch('/api/markets')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: MarketList | null) => {
        if (!cancelled && json) setData(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(slug: string) {
    setOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    if (slug === 'all') {
      params.delete('market')
    } else {
      params.set('market', slug)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const active = data?.markets.find((m) => m.slug === current)
  const label = active ? active.name : 'All Cities'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`City: ${label}`}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-surface hover:border-gray-300 transition-colors text-sm font-medium text-gray-700"
      >
        <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{active?.name ?? 'Cities'}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-72 max-h-[70vh] overflow-y-auto bg-surface border border-gray-200 rounded-xl shadow-xl z-50"
        >
          <button
            onClick={() => choose('all')}
            role="option"
            aria-selected={current === 'all'}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-3 ${
              current === 'all' ? 'bg-primary/5' : ''
            }`}
          >
            <span className="w-4 mt-0.5 shrink-0">
              {current === 'all' && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-sm text-gray-900">All Cities</span>
              <span className="block text-xs text-gray-500">
                {data ? `${data.total} upcoming event${data.total === 1 ? '' : 's'} everywhere` : 'Everywhere we cover'}
              </span>
            </span>
          </button>

          {(data?.markets ?? []).map((m) => (
            <button
              key={m.slug}
              onClick={() => choose(m.slug)}
              role="option"
              aria-selected={current === m.slug}
              className={`w-full text-left px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 flex items-start gap-3 ${
                current === m.slug ? 'bg-primary/5' : ''
              } ${m.events === 0 ? 'opacity-60' : ''}`}
            >
              <span className="w-4 mt-0.5 shrink-0">
                {current === m.slug && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-sm text-gray-900">
                  {m.label}
                  {m.events > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">{m.events} upcoming</span>
                  )}
                </span>
                {m.events === 0 && (
                  <span className="block text-xs text-gray-500">Opening soon — be the first to post</span>
                )}
              </span>
            </button>
          ))}

          {/* The towns we are covering but do not have events for yet. */}
          <Link
            href="/cities"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-primary border-t border-gray-100"
          >
            <span>Every city we cover</span>
            <ChevronDown className="w-4 h-4 -rotate-90" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}
