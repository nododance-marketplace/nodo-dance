'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DangerZone } from '@/components/auth/danger-zone'
import { parseJsonArray, formatDate, formatCurrency } from '@/lib/utils'
import { Heart, Calendar, MapPin, GraduationCap, Trash2, Send, Pencil, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function AccountDashboard({
  user,
  savedInstructors,
  savedEvents,
  submittedEvents,
}: {
  user: any
  savedInstructors: any[]
  savedEvents: any[]
  submittedEvents: any[]
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('instructors')

  async function unsaveInstructor(instructorId: string) {
    try {
      const res = await fetch('/api/saved/instructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Removed from saved')
      router.refresh()
    } catch {
      toast.error('Failed to remove')
    }
  }

  async function unsaveEvent(eventId: string) {
    try {
      const res = await fetch('/api/saved/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Removed from saved')
      router.refresh()
    } catch {
      toast.error('Failed to remove')
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Account</h1>
          <p className="text-sm text-gray-500 mt-1">{user.email}</p>
        </div>
        <Badge variant="primary">Dancer</Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('instructors')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'instructors'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          <Heart className="w-4 h-4 inline mr-1" />
          Saved Instructors
          {savedInstructors.length > 0 && (
            <Badge variant="primary" className="ml-2">{savedInstructors.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'events'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-1" />
          Saved Events
          {savedEvents.length > 0 && (
            <Badge variant="primary" className="ml-2">{savedEvents.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('myevents')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'myevents'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          <Send className="w-4 h-4 inline mr-1" />
          My Events
          {submittedEvents.length > 0 && (
            <Badge variant="primary" className="ml-2">{submittedEvents.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'settings'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Saved Instructors Tab */}
      {activeTab === 'instructors' && (
        <div>
          {savedInstructors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No saved instructors yet</h3>
                <p className="text-gray-500 mb-4">
                  Browse our instructor directory and save the ones you like.
                </p>
                <Link href="/instructors">
                  <Button variant="gradient">Browse Instructors</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {savedInstructors.map((saved) => (
                <Card key={saved.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <Link href={`/instructors/${saved.instructor.slug}`} className="flex items-center gap-3 flex-1 min-w-0">
                      {saved.instructor.photoUrl ? (
                        <img
                          src={saved.instructor.photoUrl}
                          alt={saved.instructor.displayName}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                          {saved.instructor.displayName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{saved.instructor.displayName}</p>
                        <div className="flex gap-1 mt-1">
                          {parseJsonArray(saved.instructor.styles).slice(0, 3).map((style: string) => (
                            <Badge key={style} variant="default">{style}</Badge>
                          ))}
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => unsaveInstructor(saved.instructorId)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remove from saved"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved Events Tab */}
      {activeTab === 'events' && (
        <div>
          {savedEvents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No saved events yet</h3>
                <p className="text-gray-500 mb-4">
                  Browse upcoming dance events and save the ones you want to attend.
                </p>
                <Link href="/events">
                  <Button variant="gradient">Browse Events</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {savedEvents.map((saved) => (
                <Card key={saved.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <Link href={`/events/${saved.event.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      {saved.event.imageUrl ? (
                        <img
                          src={saved.event.imageUrl}
                          alt={saved.event.title}
                          className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{saved.event.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>{formatDate(new Date(saved.event.startDateTime))}</span>
                          <span>&middot;</span>
                          <span className="truncate">{saved.event.venueName}</span>
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => unsaveEvent(saved.eventId)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remove from saved"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Submitted Events Tab */}
      {activeTab === 'myevents' && (
        <MyEventsTab events={submittedEvents} />
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Upgrade to Instructor */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <GraduationCap className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">Become an Instructor</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Want to teach dance? Upgrade your account to create an instructor profile and receive lesson requests.
                  </p>
                  <Link href="/become-an-instructor">
                    <Button variant="gradient">Upgrade to Instructor</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <DangerZone />
        </div>
      )}
    </div>
  )
}

const STATUS_BADGE: Record<string, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending Review' },
  APPROVED: { variant: 'success', label: 'Approved' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function MyEventsTab({ events }: { events: any[] }) {
  const router = useRouter()

  // Group events into singles and recurring series
  const { singles, series } = useMemo(() => {
    const seriesMap = new Map<string, any[]>()
    const singles: any[] = []

    for (const event of events) {
      if (event.isRecurring && event.recurrenceGroupId) {
        const group = seriesMap.get(event.recurrenceGroupId) || []
        group.push(event)
        seriesMap.set(event.recurrenceGroupId, group)
      } else {
        singles.push(event)
      }
    }

    // Sort each series by recurrenceIndex
    const series = Array.from(seriesMap.values()).map((group) => {
      group.sort((a: any, b: any) => (a.recurrenceIndex || 0) - (b.recurrenceIndex || 0))
      return group
    })

    return { singles, series }
  }, [events])

  async function deleteEvent(eventId: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return

    const deleteToast = toast.loading('Deleting event...')
    try {
      const res = await fetch('/api/events/submit', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success('Event deleted', { id: deleteToast })
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete event', { id: deleteToast })
    }
  }

  async function deleteSeries(eventId: string, title: string, count: number) {
    if (!confirm(`Delete all ${count} occurrences of "${title}"? This cannot be undone.`)) return

    const deleteToast = toast.loading('Deleting series...')
    try {
      const res = await fetch('/api/events/submit', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, deleteSeries: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success('Series deleted', { id: deleteToast })
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete series', { id: deleteToast })
    }
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Send className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No submitted events yet</h3>
          <p className="text-gray-500 mb-4">
            Share a dance event with the community.
          </p>
          <Link href="/submit-event">
            <Button variant="gradient">Submit an Event</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Recurring Series */}
      {series.map((group) => {
        const first = group[0]
        const last = group[group.length - 1]
        const status = STATUS_BADGE[first.status] || STATUS_BADGE.PENDING

        return (
          <Card key={first.recurrenceGroupId} className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default" className="flex items-center gap-1 text-indigo-700 bg-indigo-100">
                      <Repeat className="w-3 h-3" /> Weekly Series
                    </Badge>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="font-semibold truncate">{first.title}</p>
                  <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                    <p>Every {DAYS[first.recurrenceDay ?? 0]} &middot; {group.length} occurrences</p>
                    <p>
                      {formatDate(new Date(first.startDateTime))} &ndash; {formatDate(new Date(last.startDateTime))}
                    </p>
                    <p className="truncate">{first.venueName || first.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteSeries(first.id, first.title, group.length)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Series
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Single Events */}
      {singles.map((event) => {
        const status = STATUS_BADGE[event.status] || STATUS_BADGE.PENDING
        const isPending = event.status === 'PENDING'

        return (
          <Card key={event.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.title}
                    className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{event.title}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{formatDate(new Date(event.startDateTime))}</span>
                    <span>&middot;</span>
                    <span className="truncate">{event.venueName || event.address}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={status.variant}>{status.label}</Badge>
                {isPending && (
                  <Link href={`/submit-event?edit=${event.id}`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </Link>
                )}
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
        )
      })}
    </div>
  )
}
