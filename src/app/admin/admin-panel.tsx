'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, parseJsonArray, formatCurrency } from '@/lib/utils'
import { CheckCircle, XCircle, Trash2, RefreshCw, MapPin, MapPinOff, Repeat } from 'lucide-react'

export function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const router = useRouter()
  const [events, setEvents] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [eventsRes, profilesRes] = await Promise.all([
        fetch('/api/admin/events'),
        fetch('/api/admin/profiles'),
      ])

      if (!eventsRes.ok || !profilesRes.ok) {
        throw new Error('Failed to fetch admin data')
      }

      setEvents(await eventsRes.json())
      setProfiles(await profilesRes.json())
    } catch (error) {
      console.error('Error fetching admin data:', error)
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  async function updateEventStatus(eventId: string, newStatus: 'APPROVED' | 'REJECTED') {
    const action = newStatus === 'APPROVED' ? 'Approving' : 'Rejecting'
    const actionToast = toast.loading(`${action} event...`)

    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, status: newStatus }),
      })

      if (!res.ok) throw new Error('Failed to update event')

      toast.success(`Event ${newStatus.toLowerCase()}!`, { id: actionToast })
      fetchData()
      router.refresh()
    } catch (error) {
      toast.error('Failed to update event', { id: actionToast })
    }
  }

  async function deleteProfile(profileId: string, displayName: string) {
    if (!confirm(`Delete profile "${displayName}"? This cannot be undone.`)) return

    const deleteToast = toast.loading('Deleting profile...')

    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      })

      if (!res.ok) throw new Error('Failed to delete profile')

      toast.success('Profile deleted', { id: deleteToast })
      fetchData()
    } catch (error) {
      toast.error('Failed to delete profile', { id: deleteToast })
    }
  }

  async function deleteEvent(eventId: string, title: string) {
    if (!confirm(`Delete event "${title}"? This cannot be undone.`)) return

    const deleteToast = toast.loading('Deleting event...')
    try {
      const res = await fetch('/api/admin/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      if (!res.ok) throw new Error('Failed to delete event')
      toast.success('Event deleted', { id: deleteToast })
      fetchData()
    } catch (error) {
      toast.error('Failed to delete event', { id: deleteToast })
    }
  }

  async function geocodeEvent(eventId: string, title: string) {
    const geoToast = toast.loading(`Geocoding "${title}"...`)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'geocode' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Geocoding failed')
      }
      toast.success('Geocoded successfully!', { id: geoToast })
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Geocoding failed', { id: geoToast })
    }
  }

  async function geocodeAll() {
    const geoToast = toast.loading('Re-geocoding all events missing coordinates...')
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geocode-all' }),
      })
      if (!res.ok) throw new Error('Bulk geocoding failed')
      const data = await res.json()
      toast.success(`Done! ${data.success} geocoded, ${data.failed} failed out of ${data.total}`, { id: geoToast })
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Bulk geocoding failed', { id: geoToast })
    }
  }

  async function approveSeries(eventId: string, count: number) {
    const actionToast = toast.loading(`Approving series (${count} events)...`)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seriesAction: 'approve-series' }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Series approved! (${count} events)`, { id: actionToast })
      fetchData()
      router.refresh()
    } catch {
      toast.error('Failed to approve series', { id: actionToast })
    }
  }

  async function rejectSeries(eventId: string, count: number) {
    const actionToast = toast.loading(`Rejecting series...`)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, seriesAction: 'reject-series' }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(`Series rejected (${count} events)`, { id: actionToast })
      fetchData()
      router.refresh()
    } catch {
      toast.error('Failed to reject series', { id: actionToast })
    }
  }

  async function deleteSeries(eventId: string, title: string) {
    if (!confirm(`Delete entire series "${title}"? This removes all occurrences.`)) return
    const deleteToast = toast.loading('Deleting series...')
    try {
      const res = await fetch('/api/admin/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, deleteSeries: true }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Series deleted', { id: deleteToast })
      fetchData()
    } catch {
      toast.error('Failed to delete series', { id: deleteToast })
    }
  }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const pendingEvents = events.filter((e) => e.status === 'PENDING')
  const approvedEvents = events.filter((e) => e.status === 'APPROVED')
  const rejectedEvents = events.filter((e) => e.status === 'REJECTED')
  const missingCoords = events.filter((e) => e.lat == null || e.lng == null)

  // Group pending events: singles vs recurring series
  const pendingGroups = useMemo(() => {
    const singles: any[] = []
    const seriesMap = new Map<string, any[]>()
    pendingEvents.forEach((e) => {
      if (e.recurrenceGroupId) {
        const group = seriesMap.get(e.recurrenceGroupId) || []
        group.push(e)
        seriesMap.set(e.recurrenceGroupId, group)
      } else {
        singles.push(e)
      }
    })
    // Sort each series by recurrenceIndex
    const series = Array.from(seriesMap.values()).map((group) =>
      group.sort((a: any, b: any) => (a.recurrenceIndex || 0) - (b.recurrenceIndex || 0))
    )
    return { singles, series }
  }, [pendingEvents])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Signed in as {adminEmail}</p>
        </div>
        <div className="flex items-center gap-2">
          {missingCoords.length > 0 && (
            <Button variant="gradient" size="sm" onClick={geocodeAll}>
              <MapPin className="w-4 h-4 mr-2" />
              Geocode All ({missingCoords.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Pending Events */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
          Pending Events
          {pendingEvents.length > 0 && (
            <Badge variant="warning">{pendingEvents.length}</Badge>
          )}
        </h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl h-48 animate-pulse border" />
            ))}
          </div>
        ) : pendingEvents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No pending events to review
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Recurring series */}
            {pendingGroups.series.map((group) => {
              const first = group[0]
              const last = group[group.length - 1]
              return (
                <Card key={first.recurrenceGroupId} className="border-l-4 border-l-indigo-400 overflow-hidden">
                  {first.imageUrl && (
                    <div className="aspect-[21/9] overflow-hidden">
                      <img src={first.imageUrl} alt={first.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="primary" className="flex items-center gap-1">
                            <Repeat className="w-3 h-3" /> Weekly Series
                          </Badge>
                          <Badge>{first.eventType}</Badge>
                          <span className="text-sm text-gray-500">{group.length} occurrences</span>
                        </div>
                        <h3 className="text-xl font-semibold">{first.title}</h3>
                        <p className="text-sm text-gray-500">
                          by {first.organizerName} ({first.organizerEmail})
                        </p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Schedule: </span>
                        Every {DAYS[first.recurrenceDay ?? new Date(first.startDateTime).getDay()]}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Dates: </span>
                        {new Date(first.startDateTime).toLocaleDateString()} - {new Date(last.startDateTime).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Where: </span>
                        {first.address || first.venueName}
                        {first.address && first.venueName && ` (${first.venueName})`}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Price: </span>
                        {formatCurrency(first.price)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {parseJsonArray(first.styles).map((style: string) => (
                        <Badge key={style} variant="default">{style}</Badge>
                      ))}
                    </div>

                    {first.description && (
                      <p className="text-sm text-gray-700 mb-4 line-clamp-3">{first.description}</p>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <Button variant="gradient" size="sm" onClick={() => approveSeries(first.id, group.length)}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve Series ({group.length})
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => rejectSeries(first.id, group.length)}>
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject Series
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteSeries(first.id, first.title)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Series
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {/* Single events */}
            {pendingGroups.singles.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onApprove={() => updateEventStatus(event.id, 'APPROVED')}
                onReject={() => updateEventStatus(event.id, 'REJECTED')}
                onDelete={() => deleteEvent(event.id, event.title)}
                onGeocode={() => geocodeEvent(event.id, event.title)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Approved Events */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
          Approved Events
          <Badge variant="success">{approvedEvents.length}</Badge>
        </h2>

        {approvedEvents.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              No approved events yet
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {approvedEvents.map((event) => {
              const hasCords = event.lat != null && event.lng != null
              return (
                <Card key={event.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{event.title}</p>
                        {event.isRecurring && (
                          <Badge variant="primary" className="text-xs flex items-center gap-1">
                            <Repeat className="w-3 h-3" /> Weekly
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatDateTime(event.startDateTime)} &middot; {event.venueName || event.address}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasCords ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> On Map
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="flex items-center gap-1">
                          <MapPinOff className="w-3 h-3" /> No Coords
                        </Badge>
                      )}
                      {!hasCords && (
                        <Button variant="outline" size="sm" onClick={() => geocodeEvent(event.id, event.title)}>
                          <MapPin className="w-4 h-4 mr-1" />
                          Geocode
                        </Button>
                      )}
                      {event.recurrenceGroupId ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteSeries(event.id, event.title)}
                          title="Delete entire series"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteEvent(event.id, event.title)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Rejected Events */}
      {rejectedEvents.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
            Rejected Events
            <Badge variant="danger">{rejectedEvents.length}</Badge>
          </h2>
          <div className="space-y-3">
            {rejectedEvents.map((event) => (
              <Card key={event.id} className="opacity-60">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-500">
                      {event.organizerName} &middot; {event.venueName || event.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="danger">Rejected</Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteEvent(event.id, event.title)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Instructor Profiles */}
      <section>
        <h2 className="text-2xl font-bold mb-4">
          Instructor Profiles ({profiles.length})
        </h2>

        {profiles.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              No instructor profiles yet
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <Card key={profile.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {profile.photoUrl ? (
                      <img
                        src={profile.photoUrl}
                        alt={profile.displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {profile.displayName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{profile.displayName}</p>
                      <p className="text-sm text-gray-500">{profile.user.email}</p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {parseJsonArray(profile.styles).slice(0, 3).map((style: string) => (
                        <Badge key={style} variant="primary">{style}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={profile.isPublished ? 'success' : 'warning'}>
                      {profile.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteProfile(profile.id, profile.displayName)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EventCard({
  event,
  onApprove,
  onReject,
  onDelete,
  onGeocode,
}: {
  event: any
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
  onGeocode: () => void
}) {
  const hasCoords = event.lat != null && event.lng != null

  return (
    <Card className="border-l-4 border-l-yellow-400 overflow-hidden">
      {event.imageUrl && (
        <div className="aspect-[21/9] overflow-hidden">
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-xl font-semibold">{event.title}</h3>
            <p className="text-sm text-gray-500">
              by {event.organizerName} ({event.organizerEmail})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{event.eventType}</Badge>
            {hasCoords ? (
              <Badge variant="success" className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Mapped
              </Badge>
            ) : (
              <Badge variant="danger" className="flex items-center gap-1">
                <MapPinOff className="w-3 h-3" /> No Coords
              </Badge>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">When: </span>
            {formatDateTime(event.startDateTime)}
          </div>
          <div>
            <span className="font-medium text-gray-600">Where: </span>
            {event.address || event.venueName}
            {event.address && event.venueName && ` (${event.venueName})`}
          </div>
          <div>
            <span className="font-medium text-gray-600">Price: </span>
            {formatCurrency(event.price)}
          </div>
          {event.submittedBy?.email && (
            <div>
              <span className="font-medium text-gray-600">Submitter: </span>
              {event.submittedBy.email}
            </div>
          )}
          <div>
            <span className="font-medium text-gray-600">Submitted: </span>
            {formatDateTime(event.createdAt)}
          </div>
          {hasCoords && (
            <div>
              <span className="font-medium text-gray-600">Coords: </span>
              {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {parseJsonArray(event.styles).map((style: string) => (
            <Badge key={style} variant="default">{style}</Badge>
          ))}
        </div>

        {event.description && (
          <p className="text-sm text-gray-700 mb-4 line-clamp-3">{event.description}</p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="gradient" size="sm" onClick={onApprove}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button variant="destructive" size="sm" onClick={onReject}>
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
          {!hasCoords && (
            <Button variant="outline" size="sm" onClick={onGeocode}>
              <MapPin className="w-4 h-4 mr-2" />
              Geocode
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
