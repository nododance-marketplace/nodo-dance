'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InstructorProfileEditor } from '@/components/instructors/instructor-profile-editor'
import { DangerZone } from '@/components/auth/danger-zone'
import { formatDateTime } from '@/lib/utils'

export function DashboardView({ user, lessonRequests: initialRequests }: { user: any; lessonRequests: any[] }) {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="page-shell">
      <h1 className="page-heading mb-8">Dashboard</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'profile'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'requests'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          Lesson Requests
          {initialRequests.length > 0 && (
            <Badge variant="primary" className="ml-2">
              {initialRequests.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-8">
          <InstructorProfileEditor user={user} profile={user.instructorProfile} />
          <DangerZone />
        </div>
      )}

      {/* Lesson Requests Tab */}
      {activeTab === 'requests' && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Lesson Requests</h2>
          {initialRequests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-600">
                No lesson requests yet. Students will contact you through your profile.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {initialRequests.map((request: any) => (
                <Card key={request.id}>
                  <CardContent className="p-5 sm:p-8">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{request.studentName}</h3>
                        <p className="text-sm text-gray-600">{formatDateTime(request.createdAt)}</p>
                      </div>
                      <Badge>{request.lessonType}</Badge>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Email</p>
                        <a href={`mailto:${request.studentEmail}`} className="text-primary hover:underline">
                          {request.studentEmail}
                        </a>
                      </div>
                      {request.studentPhone && (
                        <div>
                          <p className="text-sm font-medium text-gray-600">Phone</p>
                          <a href={`tel:${request.studentPhone}`} className="text-primary hover:underline">
                            {request.studentPhone}
                          </a>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-600">Style</p>
                        <p>{request.style}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Preferred Times</p>
                        <p>{request.preferredTimes}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">Message</p>
                      <p className="text-gray-700">{request.message}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
