'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, DollarSign, Instagram, Globe, Mail, Calendar, Star, Users, Award, Video, Lock } from 'lucide-react'
import { parseJsonArray, formatCurrency, getYouTubeEmbedUrl } from '@/lib/utils'
import { LessonRequestModal } from './lesson-request-modal'
import { LoginPromptCard } from '@/components/auth/login-prompt-card'
import { SaveButton } from '@/components/auth/save-button'
import { LOCATION_TYPES } from '@/lib/constants'

interface InstructorProfileViewProps {
  instructor: any
  isLoggedIn?: boolean
}

export function InstructorProfileView({ instructor, isLoggedIn = false }: InstructorProfileViewProps) {
  const [showRequestModal, setShowRequestModal] = useState(false)
  const pathname = usePathname()
  const callbackUrl = encodeURIComponent(pathname)

  const styles = parseJsonArray(instructor.styles)
  const displayStyles = instructor.otherStyle
    ? [...styles.filter((s: string) => s !== 'Other'), instructor.otherStyle]
    : styles
  const skillLevels = parseJsonArray(instructor.skillLevels)
  const offerings = parseJsonArray(instructor.offerings)
  const languages = parseJsonArray(instructor.languages)
  const locationType = LOCATION_TYPES.find((t) => t.value === instructor.locationType)
  const embedUrl = getYouTubeEmbedUrl(instructor.youtubeUrl || instructor.youtubeVideoUrl)
  const certificationsList = instructor.certifications
    ? instructor.certifications.split('\n').filter((cert: string) => cert.trim())
    : []

  const googleMapsUrl = instructor.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(instructor.address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(instructor.neighborhood || 'Charlotte, NC')}`

  const hasPaymentMethods = instructor.paymentCash || instructor.paymentVenmo || instructor.paymentCashApp || instructor.paymentPayPal

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-primary/10 to-accent-coral/10 flex items-center justify-center flex-shrink-0">
                {instructor.photoUrl ? (
                  <img
                    src={instructor.photoUrl}
                    alt={instructor.displayName}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-5xl font-bold text-primary/20">
                    {instructor.displayName.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-3xl font-bold mb-2">{instructor.displayName}</h1>
                  <SaveButton itemId={instructor.id} type="instructor" />
                </div>

                {instructor.headline && (
                  <p className="text-lg text-gray-600 mb-3">{instructor.headline}</p>
                )}

                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-700">
                  {instructor.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold">{instructor.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {instructor.yearsTeaching && (
                    <div className="flex items-center gap-1">
                      <Award className="w-4 h-4 text-accent-coral" />
                      <span>{instructor.yearsTeaching} {instructor.yearsTeaching === 1 ? 'year' : 'years'} teaching</span>
                    </div>
                  )}
                  {instructor.studentsTaught && (
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-primary" />
                      <span>{instructor.studentsTaught}+ students</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {displayStyles.map((style: string) => (
                    <Badge key={style} variant="primary">
                      {style}
                    </Badge>
                  ))}
                </div>

                {instructor.neighborhood && (
                  <div className="flex items-center text-gray-600 mb-2">
                    <MapPin className="w-4 h-4 mr-2" />
                    {instructor.neighborhood}
                  </div>
                )}

                {/* Action Buttons - Soft Gated */}
                <div className="flex flex-wrap gap-3 mt-4">
                  {isLoggedIn ? (
                    <>
                      {instructor.bookingUrl ? (
                        <a href={instructor.bookingUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="gradient">
                            <Calendar className="w-4 h-4 mr-2" />
                            Book a Lesson
                          </Button>
                        </a>
                      ) : (
                        <Button variant="gradient" onClick={() => setShowRequestModal(true)}>
                          <Mail className="w-4 h-4 mr-2" />
                          Request a Lesson
                        </Button>
                      )}
                    </>
                  ) : (
                    <Link href={`/auth/signin?callbackUrl=${callbackUrl}`}>
                      <Button variant="gradient">
                        <Lock className="w-4 h-4 mr-2" />
                        Create Free Account to Request Lesson
                      </Button>
                    </Link>
                  )}
                  {instructor.websiteUrl && (
                    <a href={instructor.websiteUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline">
                        <Globe className="w-4 h-4 mr-2" />
                        Website
                      </Button>
                    </a>
                  )}
                  {instructor.instagramUrl && (
                    <a href={instructor.instagramUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Instagram className="w-4 h-4 mr-2" />
                        Instagram
                      </Button>
                    </a>
                  )}
                  {instructor.youtubeUrl && (
                    <a href={instructor.youtubeUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Video className="w-4 h-4 mr-2" />
                        YouTube
                      </Button>
                    </a>
                  )}
                  {instructor.tiktokUrl && (
                    <a href={instructor.tiktokUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Video className="w-4 h-4 mr-2" />
                        TikTok
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Login Prompt Card - only for logged-out users */}
        {!isLoggedIn && (
          <div className="mb-8">
            <LoginPromptCard />
          </div>
        )}

        {/* Introduction Video — Preply-style, above bio */}
        {embedUrl && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">Introduction Video</h2>
              <div className="aspect-video rounded-lg overflow-hidden">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* About */}
        {instructor.bio && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">About</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{instructor.bio}</p>
            </CardContent>
          </Card>
        )}

        {/* Certifications */}
        {certificationsList.length > 0 && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">Certifications</h2>
              <ul className="space-y-2">
                {certificationsList.map((cert: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <Award className="w-5 h-5 text-accent-coral mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{cert}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* What I Teach */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">What I Teach</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Dance Styles</h3>
                <div className="flex flex-wrap gap-2">
                  {displayStyles.map((style: string) => (
                    <Badge key={style}>{style}</Badge>
                  ))}
                </div>
              </div>
              {skillLevels.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Skill Levels</h3>
                  <div className="flex flex-wrap gap-2">
                    {skillLevels.map((level) => (
                      <Badge key={level} variant="default">
                        {level}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {offerings.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">What I Offer</h3>
                  <div className="flex flex-wrap gap-2">
                    {offerings.map((offering: string) => (
                      <Badge key={offering} variant="default">
                        {offering}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {languages.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((language: string) => (
                      <Badge key={language} variant="default">
                        {language}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {instructor.yearsTeaching && (
                <div>
                  <h3 className="font-semibold mb-2">Experience</h3>
                  <p className="text-gray-700">
                    {instructor.yearsTeaching} {instructor.yearsTeaching === 1 ? 'year' : 'years'} teaching
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        {(instructor.offersPrivate || instructor.offersGroup) && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">Pricing</h2>
              <div className="space-y-4">
                {instructor.offersPrivate && (
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-5 h-5 text-accent-coral mt-1" />
                    <div>
                      <h3 className="font-semibold">Private Lessons</h3>
                      <p className="text-gray-700">
                        {formatCurrency(instructor.privateRateHourly)}/hour
                      </p>
                    </div>
                  </div>
                )}
                {instructor.offersGroup && (
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-5 h-5 text-accent-coral mt-1" />
                    <div>
                      <h3 className="font-semibold">Group Classes</h3>
                      <p className="text-gray-700">
                        {formatCurrency(instructor.groupRatePerClass)}/class
                      </p>
                      {instructor.groupClassNotes && (
                        <p className="text-sm text-gray-600 mt-1">
                          {instructor.groupClassNotes}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Location & Travel */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">Location & Travel</h2>
            <div className="space-y-3">
              {locationType && (
                <p className="text-gray-700">
                  <strong>Type:</strong> {locationType.label}
                </p>
              )}
              {instructor.neighborhood && (
                <p className="text-gray-700">
                  <strong>Area:</strong> {instructor.neighborhood}
                </p>
              )}
              {instructor.travelRadiusMiles && (
                <p className="text-gray-700">
                  <strong>Travel Radius:</strong> {instructor.travelRadiusMiles} miles
                </p>
              )}
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <MapPin className="w-4 h-4 mr-2" />
                  Open in Google Maps
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods - GATED: only show details to logged-in users */}
        {hasPaymentMethods && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">Payment Methods</h2>
              {isLoggedIn ? (
                <div className="flex flex-wrap gap-3">
                  {instructor.paymentCash && <Badge>Cash</Badge>}
                  {instructor.paymentVenmo && (
                    <a
                      href={`https://venmo.com/${instructor.paymentVenmo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge className="cursor-pointer hover:bg-primary">
                        Venmo: @{instructor.paymentVenmo}
                      </Badge>
                    </a>
                  )}
                  {instructor.paymentCashApp && (
                    <a
                      href={`https://cash.app/${instructor.paymentCashApp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge className="cursor-pointer hover:bg-primary">
                        Cash App: ${instructor.paymentCashApp}
                      </Badge>
                    </a>
                  )}
                  {instructor.paymentPayPal && (
                    <a
                      href={`https://paypal.me/${instructor.paymentPayPal}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge className="cursor-pointer hover:bg-primary">
                        PayPal: {instructor.paymentPayPal}
                      </Badge>
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-500">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm">
                    <Link href={`/auth/signin?callbackUrl=${callbackUrl}`} className="text-primary hover:underline font-medium">
                      Sign in
                    </Link>
                    {' '}to see payment methods
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {isLoggedIn && showRequestModal && (
        <LessonRequestModal
          instructor={instructor}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </>
  )
}
