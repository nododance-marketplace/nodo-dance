'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle, Ban, CheckCircle2, Globe, ListChecks, Pause, Play,
  Radio, ShieldAlert, Sparkles, XCircle, Clock, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'review' | 'sources' | 'coverage'

interface Overview {
  cities: number
  sources: number
  sourcesPaused: number
  sourcesDenied: number
  candidates: number
  pass: number
  quarantine: number
  rejected: number
  pending: number
  published: number
  matches: number
  schools: number
  publishedEvents: number
  recurring: number
  freshSources: number
  attempts: { status: string; count: number }[]
  byCity: {
    slug: string; name: string; state: string; status: string; timeZone: string
    sources: number; paused: number; fresh: number; candidates: number
  }[]
}

interface Candidate {
  id: string
  title: string
  description: string | null
  eventType: string | null
  styles: string[]
  localDate: string | null
  localTime: string | null
  timeZone: string | null
  isRecurring: boolean
  recurrenceText: string | null
  recurrenceRule: { rrule?: string; until?: string; count?: number; interval?: number; byDay?: number[] } | null
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  price: number | null
  priceText: string | null
  organizerName: string | null
  sourceUrl: string
  registrationUrl: string | null
  confidence: number
  qaStatus: string
  qaReasons: string[]
  reviewStatus: string
  source: {
    id: string; url: string; domain: string; organizationName: string | null
    robotsStatus: string; permissionsStatus: string
  }
  matches: { id: string; matchType: string; score: number; reason: string; existingEventId: string | null; status: string }[]
  evidence: { fieldName: string; fieldValue: string; method: string; url: string }[]
  createdAt: string
}

interface SourceRow {
  id: string
  url: string
  domain: string
  organizationName: string | null
  city: string | null
  citySlug: string | null
  sourceCategory: string
  robotsStatus: string
  robotsDetail: string | null
  permissionsStatus: string
  isPaused: boolean
  optOut: boolean
  reliability: number
  extractionSuccessRate: number
  lastSuccessAt: string | null
  nextCrawlAt: string | null
  crawlIntervalDays: number
  consecutiveFailures: number
  discoveredVia: string | null
  candidates: number
  notes: string | null
}

const TABS: { id: Tab; label: string; icon: typeof Globe }[] = [
  { id: 'overview', label: 'Overview', icon: Globe },
  { id: 'review', label: 'Review Queue', icon: ListChecks },
  { id: 'sources', label: 'Source Registry', icon: Radio },
  { id: 'coverage', label: 'Coverage', icon: ShieldAlert },
]

export function AtlasAdmin({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sources, setSources] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, c, s] = await Promise.all([
        fetch('/api/admin/atlas/overview'),
        fetch('/api/admin/atlas/candidates?status=PENDING&limit=100'),
        fetch('/api/admin/atlas/sources'),
      ])
      if (!o.ok || !c.ok || !s.ok) throw new Error('Failed to load Atlas data')
      const [oj, cj, sj] = await Promise.all([o.json(), c.json(), s.json()])
      setOverview(oj)
      setCandidates(cj.candidates ?? [])
      setSources(sj.sources ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Atlas data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED' | 'PUBLISHED') {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/atlas/candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      toast.success(
        decision === 'PUBLISHED' ? 'Published to the live site' :
        decision === 'APPROVED' ? 'Approved' : 'Rejected'
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleSource(id: string, action: 'pause' | 'resume') {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/atlas/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (!res.ok) throw new Error('Could not update source')
      toast.success(action === 'pause' ? 'Source paused' : 'Source resumed')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update source')
    } finally {
      setBusyId(null)
    }
  }

  async function setPermissions(id: string, permissionsStatus: string) {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/atlas/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'set-permissions', permissionsStatus }),
      })
      if (!res.ok) throw new Error('Could not update permissions')
      toast.success(`Permissions set to ${permissionsStatus}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update permissions')
    } finally {
      setBusyId(null)
    }
  }

  async function killSwitch(action: 'pause-all' | 'resume-all') {
    setBusyId('kill-switch')
    try {
      const res = await fetch('/api/admin/atlas/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Kill switch failed')
      toast.success(action === 'pause-all' ? `All crawling paused (${data.paused} sources)` : `Crawling resumed (${data.resumed} sources)`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kill switch failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header block">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="page-heading flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-[var(--color-accent-ink)]" aria-hidden="true" />
              Nodo Atlas
            </h1>
            <p className="page-intro">
              Automated discovery and ingestion for dance events, schools and instructors.
              Everything discovered enters review before it is published. Signed in as {adminEmail}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => killSwitch('pause-all')}
              disabled={busyId === 'kill-switch'}
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause all crawling
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => killSwitch('resume-all')}
              disabled={busyId === 'kill-switch'}
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {overview && overview.sourcesPaused > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-amber-900">
              Crawling is paused on {overview.sourcesPaused} source{overview.sourcesPaused === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-amber-800">
              The kill switch is active. Resume crawling when you are ready.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-[var(--color-accent-ink)] text-[var(--color-accent-ink)]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
              {t.id === 'review' && overview && overview.pending > 0 && (
                <Badge variant="warning" className="ml-1">{overview.pending}</Badge>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {tab === 'overview' && overview && <OverviewTab overview={overview} />}
          {tab === 'review' && (
            <ReviewTab candidates={candidates} busyId={busyId} onDecide={decide} />
          )}
          {tab === 'sources' && (
            <SourcesTab
              sources={sources}
              busyId={busyId}
              onToggle={toggleSource}
              onPermissions={setPermissions}
            />
          )}
          {tab === 'coverage' && overview && <CoverageTab overview={overview} />}
        </>
      )}
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({ overview }: { overview: Overview }) {
  const funnel = [
    { label: 'Sources registered', value: overview.sources, tone: 'text-primary' },
    { label: 'Candidates extracted', value: overview.candidates, tone: 'text-primary' },
    { label: 'Passed QA', value: overview.pass, tone: 'text-[var(--color-success)]' },
    { label: 'Awaiting review', value: overview.pending, tone: 'text-amber-700' },
    { label: 'Published', value: overview.published, tone: 'text-[var(--color-success)]' },
  ]
  const conversion = overview.candidates > 0 ? (overview.published / overview.candidates) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {funnel.map(item => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className={cn('mt-2 text-3xl font-bold leading-none', item.tone)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-surface p-5">
          <h2 className="font-semibold mb-4">Extraction funnel</h2>
          <div className="space-y-2.5 text-sm">
            <Row label="Extracted" value={overview.candidates} max={overview.candidates} />
            <Row label="Passed QA" value={overview.pass} max={overview.candidates} />
            <Row label="Quarantined" value={overview.quarantine} max={overview.candidates} />
            <Row label="Rejected" value={overview.rejected} max={overview.candidates} />
            <Row label="Published" value={overview.published} max={overview.candidates} />
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Published extraction rate <span className="font-semibold text-primary">{conversion.toFixed(1)}%</span> of extracted candidates.
            {' '}A thousand inaccurate events are worse than a hundred verified ones — quarantine is a feature.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-surface p-5">
          <h2 className="font-semibold mb-4">Crawl health</h2>
          {overview.attempts.length === 0 ? (
            <p className="text-sm text-gray-500">No crawl attempts recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {overview.attempts.map(a => (
                <div key={a.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{a.status.replace(/_/g, ' ')}</span>
                  <span className="font-mono font-medium">{a.count}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Fresh sources (7d)</p>
              <p className="font-semibold text-primary">{overview.freshSources} / {overview.sources}</p>
            </div>
            <div>
              <p className="text-gray-500">Duplicate proposals</p>
              <p className="font-semibold text-primary">{overview.matches}</p>
            </div>
            <div>
              <p className="text-gray-500">Recurring candidates</p>
              <p className="font-semibold text-primary">{overview.recurring}</p>
            </div>
            <div>
              <p className="text-gray-500">Candidate schools</p>
              <p className="font-semibold text-primary">{overview.schools}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono text-xs">{value} ({pct}%)</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Review queue ───────────────────────────────────────────────────────────

function ReviewTab({
  candidates,
  busyId,
  onDecide,
}: {
  candidates: Candidate[]
  busyId: string | null
  onDecide: (id: string, decision: 'APPROVED' | 'REJECTED' | 'PUBLISHED') => void
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--color-success)]" aria-hidden="true" />
        <h2 className="mt-3 font-semibold">The review queue is empty</h2>
        <p className="mt-1 text-sm text-gray-600">
          Nothing is waiting for a decision. New candidates appear here after a crawl run.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Every candidate carries its source, its extracted fields and the evidence behind them.
        Nothing reaches the public site without a decision here.
      </p>
      {candidates.map(c => (
        <article key={c.id} className="rounded-xl border border-gray-200 bg-surface">
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant={c.qaStatus === 'PASS' ? 'success' : c.qaStatus === 'QUARANTINE' ? 'warning' : 'danger'}>
                  {c.qaStatus}
                </Badge>
                {c.isRecurring && <Badge variant="primary">Recurring</Badge>}
                {c.styles.map(s => (
                  <Badge key={s}>{s}</Badge>
                ))}
                <span className="ml-auto text-xs font-mono text-gray-500">
                  confidence {c.confidence.toFixed(2)}
                </span>
              </div>

              <h3 className="text-lg font-semibold leading-snug">{c.title}</h3>

              <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <Field label="When" value={c.localDate ? `${c.localDate}${c.localTime ? ` · ${c.localTime}` : ''}` : '—'} />
                <Field label="Venue" value={c.venueName ?? '—'} />
                <Field label="Address" value={c.address ?? '—'} />
                <Field label="City" value={[c.city, c.state].filter(Boolean).join(', ') || '—'} />
                <Field label="Type" value={c.eventType ?? '—'} />
                <Field label="Price" value={c.priceText ?? (c.price != null ? `$${c.price}` : '—')} />
              </dl>

              {c.recurrenceText && (
                <p className="mt-3 text-sm text-gray-700">
                  <span className="font-medium">Recurrence:</span> {c.recurrenceText}
                  {c.recurrenceRule?.until && (
                    <span className="text-gray-500"> · horizon {c.recurrenceRule.until}</span>
                  )}
                </p>
              )}

              {c.qaReasons.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Why this needs attention</p>
                  <ul className="text-sm text-amber-900 list-disc pl-4">
                    {c.qaReasons.map(r => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}

              {c.matches.length > 0 && (
                <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Possible duplicates</p>
                  {c.matches.map(m => (
                    <p key={m.id} className="text-sm text-gray-700">
                      <span className="font-mono text-xs">{m.matchType}</span> ({m.score.toFixed(2)}) — {m.reason}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--color-accent-ink)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {c.source.domain || c.sourceUrl}
                </a>
                <span>source: {c.source.organizationName ?? 'unknown'}</span>
                <span>robots: {c.source.robotsStatus}</span>
                <span>permissions: {c.source.permissionsStatus}</span>
                {c.registrationUrl && (
                  <a href={c.registrationUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    registration link
                  </a>
                )}
              </div>
            </div>

            <div className="flex lg:flex-col gap-2 p-5 lg:w-56 lg:border-l lg:border-gray-100 bg-gray-50/60">
              <Button
                size="sm"
                onClick={() => onDecide(c.id, 'PUBLISHED')}
                disabled={busyId === c.id || c.reviewStatus !== 'APPROVED'}
                title={c.reviewStatus !== 'APPROVED' ? 'Approve first' : 'Publish to the live site'}
              >
                Publish
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDecide(c.id, 'APPROVED')}
                disabled={busyId === c.id}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDecide(c.id, 'REJECTED')}
                disabled={busyId === c.id}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
              {c.sourceUrl && (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto text-center text-xs text-gray-500 hover:text-gray-900"
                >
                  View source
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-900 truncate" title={value}>{value}</dd>
    </div>
  )
}

// ── Sources ────────────────────────────────────────────────────────────────

function SourcesTab({
  sources,
  busyId,
  onToggle,
  onPermissions,
}: {
  sources: SourceRow[]
  busyId: string | null
  onToggle: (id: string, action: 'pause' | 'resume') => void
  onPermissions: (id: string, permissionsStatus: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-surface p-4">
        <ShieldAlert className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Permission status gates publication.</span> A source marked
          <span className="font-mono text-xs"> REVIEW_REQUIRED</span> or
          <span className="font-mono text-xs"> DENIED</span> cannot be published from, and any candidate
          it produces is rejected by the quality gate. Set a status only after checking the site's terms
          and the organizer's wishes.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Robots</th>
              <th className="px-4 py-3 font-medium">Permissions</th>
              <th className="px-4 py-3 font-medium">Last success</th>
              <th className="px-4 py-3 font-medium">Candidates</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sources.map(s => (
              <tr key={s.id} className={cn(s.isPaused && 'opacity-50')}>
                <td className="px-4 py-3">
                  <p className="font-medium">{s.organizationName ?? s.domain}</p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:underline">
                    {s.domain}
                  </a>
                  {s.discoveredVia && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">{s.discoveredVia}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{s.city ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.robotsStatus === 'ALLOWED' ? 'success' : s.robotsStatus === 'DISALLOWED' ? 'danger' : 'default'}>
                    {s.robotsStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.permissionsStatus}
                    onChange={e => onPermissions(s.id, e.target.value)}
                    disabled={busyId === s.id}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-surface"
                    aria-label={`Permissions for ${s.domain}`}
                  >
                    <option value="UNKNOWN">UNKNOWN</option>
                    <option value="PERMITTED">PERMITTED</option>
                    <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
                    <option value="DENIED">DENIED</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString().slice(0, 10) : '—'}
                  {s.consecutiveFailures > 0 && (
                    <span className="ml-1 text-amber-700">({s.consecutiveFailures} fails)</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono">{s.candidates}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggle(s.id, s.isPaused ? 'resume' : 'pause')}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-primary"
                  >
                    {s.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {s.isPaused ? 'Resume' : 'Pause'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Coverage ───────────────────────────────────────────────────────────────

function CoverageTab({ overview }: { overview: Overview }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-surface p-5">
        <h2 className="font-semibold mb-1">Coverage is measured, never claimed</h2>
        <p className="text-sm text-gray-600 mb-4">
          Atlas tracks the sources it has registered and the listings it has verified for each city.
          It never asserts that it has found every event in a city — absence of results is a gap in
          our query set, not proof that no community exists.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left border-b border-gray-200">
              <tr>
                <th className="py-2 pr-4 font-medium">City</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Timezone</th>
                <th className="py-2 pr-4 font-medium">Sources</th>
                <th className="py-2 pr-4 font-medium">Fresh (7d)</th>
                <th className="py-2 pr-4 font-medium">Candidates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overview.byCity.map(c => (
                <tr key={c.slug}>
                  <td className="py-2.5 pr-4 font-medium">{c.name}, {c.state}</td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={c.status === 'ACTIVE' ? 'success' : 'default'}>{c.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 font-mono text-xs">{c.timeZone}</td>
                  <td className="py-2.5 pr-4 font-mono">{c.sources}</td>
                  <td className="py-2.5 pr-4 font-mono">{c.fresh}</td>
                  <td className="py-2.5 pr-4 font-mono">{c.candidates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-surface p-5">
        <h2 className="font-semibold mb-3">Operating principles</h2>
        <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
          <li>Nothing is published without a human decision, until a source is explicitly approved for auto-publication.</li>
          <li>Recurring listings expire and must be re-confirmed — an old page saying "every Thursday" is not a promise.</li>
          <li>Organizer-submitted and organizer-claimed records always win a conflict; scraped data never overwrites them.</li>
          <li>Every published record links back to its source and carries the date it was last verified.</li>
          <li>Removal and correction requests are honoured permanently through the source opt-out flag.</li>
        </ul>
      </div>

      <p className="text-sm text-gray-500">
        <Link href="/admin" className="text-[var(--color-accent-ink)] hover:underline">
          ← Back to the main admin panel
        </Link>
      </p>
    </div>
  )
}
