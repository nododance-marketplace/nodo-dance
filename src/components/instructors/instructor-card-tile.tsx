import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { MapPin, Star, ChevronRight, Disc3 } from 'lucide-react'
import { parseJsonArray } from '@/lib/utils'
import { SaveButton } from '@/components/auth/save-button'

interface InstructorCardTileProps {
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

export function InstructorCardTile({ instructor }: InstructorCardTileProps) {
  const rawStyles = parseJsonArray(instructor.styles)
  const styles = instructor.otherStyle
    ? rawStyles.map((s) => s === 'Other' ? instructor.otherStyle! : s)
    : rawStyles

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors group">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-accent-coral/10 flex items-center justify-center overflow-hidden flex-shrink-0">
        {instructor.photoUrl ? (
          <img
            src={instructor.photoUrl}
            alt={instructor.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold text-primary/30">
            {instructor.displayName.charAt(0)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Link href={`/instructors/${instructor.slug}`} className="text-sm font-semibold text-gray-900 truncate hover:underline">
            {instructor.displayName}
          </Link>
          {instructor.isDJ && (
            <span title="DJ"><Disc3 className="w-3 h-3 text-primary flex-shrink-0" /></span>
          )}
          {instructor.rating && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs font-semibold text-gray-600">{instructor.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            {styles.slice(0, 3).map((style) => (
              <Badge key={style} variant="primary" className="text-[10px] px-1.5 py-0">
                {style}
              </Badge>
            ))}
            {styles.length > 3 && (
              <span className="text-[10px] text-gray-400">+{styles.length - 3}</span>
            )}
          </div>
          {instructor.neighborhood && (
            <>
              <span className="text-gray-300">·</span>
              <div className="flex items-center gap-0.5 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{instructor.neighborhood}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <SaveButton itemId={instructor.id} type="instructor" size="sm" />
        <Link href={`/instructors/${instructor.slug}`}>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
        </Link>
      </div>
    </div>
  )
}
