import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, DollarSign, Instagram, Star, Award, Globe, Video, Disc3 } from 'lucide-react'
import { parseJsonArray, formatCurrency, extractInstagramHandle } from '@/lib/utils'
import { SaveButton } from '@/components/auth/save-button'

interface InstructorCardProps {
  instructor: {
    id: string
    slug: string
    displayName: string
    headline: string | null
    photoUrl: string | null
    instagramUrl: string | null
    styles: string
    neighborhood: string | null
    privateRateHourly: number | null
    groupRatePerClass: number | null
    offersPrivate: boolean
    offersGroup: boolean
    bio: string | null
    rating: number | null
    yearsTeaching: number | null
    youtubeUrl: string | null
    tiktokUrl: string | null
    websiteUrl: string | null
    isDJ?: boolean
  }
}

export function InstructorCard({ instructor }: InstructorCardProps) {
  const styles = parseJsonArray(instructor.styles)
  const instagramHandle = extractInstagramHandle(instructor.instagramUrl)

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-0">
        <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent-coral/10 flex items-center justify-center relative overflow-hidden">
          {instructor.photoUrl ? (
            <img
              src={instructor.photoUrl}
              alt={instructor.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-6xl font-bold text-primary/20">
              {instructor.displayName.charAt(0)}
            </div>
          )}
          <div className="absolute top-2 right-2">
            <SaveButton itemId={instructor.id} type="instructor" size="sm" className="shadow-sm" />
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-semibold">{instructor.displayName}</h3>
            {instructor.isDJ && (
              <Badge variant="primary" className="flex items-center gap-0.5 text-[10px] px-1.5 py-0">
                <Disc3 className="w-3 h-3" /> DJ
              </Badge>
            )}
          </div>

          {instructor.headline && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-1">
              {instructor.headline}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mb-3">
            {styles.slice(0, 3).map((style) => (
              <Badge key={style} variant="primary">
                {style}
              </Badge>
            ))}
            {styles.length > 3 && (
              <Badge variant="default">+{styles.length - 3}</Badge>
            )}
          </div>

          {/* Stats Row */}
          {(instructor.rating || instructor.yearsTeaching) && (
            <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-600">
              {instructor.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span className="font-semibold">{instructor.rating.toFixed(1)}</span>
                </div>
              )}
              {instructor.yearsTeaching && (
                <div className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-accent-coral" />
                  <span>{instructor.yearsTeaching}yr{instructor.yearsTeaching !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          )}

          {instructor.neighborhood && (
            <div className="flex items-center text-sm text-gray-600 mb-2">
              <MapPin className="w-4 h-4 mr-1" />
              {instructor.neighborhood}
            </div>
          )}

          {/* Social Icons Row */}
          {(instructor.instagramUrl || instructor.youtubeUrl || instructor.tiktokUrl || instructor.websiteUrl) && (
            <div className="flex items-center gap-2 mb-2">
              {instructor.instagramUrl && (
                <a href={instructor.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-accent-coral transition-colors" title="Instagram">
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {instructor.youtubeUrl && (
                <a href={instructor.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-red-500 transition-colors" title="YouTube">
                  <Video className="w-4 h-4" />
                </a>
              )}
              {instructor.tiktokUrl && (
                <a href={instructor.tiktokUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-black transition-colors" title="TikTok">
                  <Video className="w-4 h-4" />
                </a>
              )}
              {instructor.websiteUrl && (
                <a href={instructor.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors" title="Website">
                  <Globe className="w-4 h-4" />
                </a>
              )}
            </div>
          )}

          <div className="flex items-center text-sm text-gray-600 mb-4">
            <DollarSign className="w-4 h-4 mr-1" />
            {instructor.offersPrivate && instructor.privateRateHourly && (
              <span className="mr-2">
                Private: {formatCurrency(instructor.privateRateHourly)}/hr
              </span>
            )}
            {instructor.offersGroup && instructor.groupRatePerClass && (
              <span>
                Group: {formatCurrency(instructor.groupRatePerClass)}/class
              </span>
            )}
          </div>

          {instructor.bio && (
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {instructor.bio}
            </p>
          )}

          <Link href={`/instructors/${instructor.slug}`}>
            <Button variant="outline" className="w-full">
              View Profile
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
