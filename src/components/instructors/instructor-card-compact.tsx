import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Star, Disc3 } from 'lucide-react'
import { parseJsonArray } from '@/lib/utils'
import { SaveButton } from '@/components/auth/save-button'

interface InstructorCardCompactProps {
  instructor: {
    id: string
    slug: string
    displayName: string
    headline: string | null
    photoUrl: string | null
    styles: string
    neighborhood: string | null
    rating: number | null
    yearsTeaching: number | null
    isDJ?: boolean
    otherStyle?: string | null
  }
}

export function InstructorCardCompact({ instructor }: InstructorCardCompactProps) {
  const rawStyles = parseJsonArray(instructor.styles)
  const styles = instructor.otherStyle
    ? rawStyles.map((s) => s === 'Other' ? instructor.otherStyle! : s)
    : rawStyles

  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardContent className="p-0">
        <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-accent-coral/10 flex items-center justify-center relative overflow-hidden">
          {instructor.photoUrl ? (
            <img
              src={instructor.photoUrl}
              alt={instructor.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-4xl font-bold text-primary/20">
              {instructor.displayName.charAt(0)}
            </div>
          )}
          <div className="absolute top-1.5 right-1.5">
            <SaveButton itemId={instructor.id} type="instructor" size="sm" className="shadow-sm" />
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1 mb-1">
            <h3 className="text-sm font-semibold line-clamp-1">{instructor.displayName}</h3>
            {instructor.isDJ && (
              <span title="DJ"><Disc3 className="w-3 h-3 text-primary flex-shrink-0" /></span>
            )}
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {styles.slice(0, 2).map((style) => (
              <Badge key={style} variant="primary" className="text-[10px] px-1.5 py-0">
                {style}
              </Badge>
            ))}
            {styles.length > 2 && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                +{styles.length - 2}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            {instructor.rating && (
              <div className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold">{instructor.rating.toFixed(1)}</span>
              </div>
            )}
            {instructor.neighborhood && (
              <div className="flex items-center gap-0.5 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{instructor.neighborhood}</span>
              </div>
            )}
          </div>

          <Link href={`/instructors/${instructor.slug}`} className="block">
            <span className="text-xs font-medium text-primary hover:underline">
              View Profile
            </span>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
