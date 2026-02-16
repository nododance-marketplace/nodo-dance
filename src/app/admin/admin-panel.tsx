'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, parseJsonArray, formatCurrency } from '@/lib/utils'
import { CheckCircle, XCircle, Trash2, RefreshCw } from 'lucide-react'

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

  const pendingEvents = events.filter((e) => e.status === 'PENDING')
  const approvedEvents = events.filter((e) => e.status === 'APPROVED')
  const rejectedEvents = events.filter((e) => e.status === 'REJECTED')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Signed in as {adminEmail}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
            {pendingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onApprove={() => updateEventStatus(event.id, 'APPROVED')}
                onReject={() => updateEventStatus(event.id, 'REJECTED')}
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
            {approvedEvents.map((event) => (
              <Card key={event.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-500">
                      {formatDateTime(event.startDateTime)} &middot; {event.venueName}
                    </p>
                  </div>
                  <Badge variant="success">Approved</Badge>
                </CardContent>
              </Card>
            ))}
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
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-500">
                      {event.organizerName} &middot; {event.venueName}
                    </p>
                  </div>
                  <Badge variant="danger">Rejected</Badge>
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
}: {
  event: any
  onApprove: () => void
  onReject: () => void
}) {
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
          <Badge>{event.eventType}</Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">When: </span>
            {formatDateTime(event.startDateTime)}
          </div>
          <div>
            <span className="font-medium text-gray-600">Where: </span>
            {event.venueName}
            {event.address && ` — ${event.address}`}
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
          {event.neighborhood && (
            <div>
              <span className="font-medium text-gray-600">Area: </span>
              {event.neighborhood}
            </div>
          )}
          <div>
            <span className="font-medium text-gray-600">Submitted: </span>
            {formatDateTime(event.createdAt)}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {parseJsonArray(event.styles).map((style: string) => (
            <Badge key={style} variant="default">{style}</Badge>
          ))}
        </div>

        {event.description && (
          <p className="text-sm text-gray-700 mb-4 line-clamp-3">{event.description}</p>
        )}

        <div className="flex gap-3">
          <Button variant="gradient" size="sm" onClick={onApprove}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button variant="destructive" size="sm" onClick={onReject}>
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
