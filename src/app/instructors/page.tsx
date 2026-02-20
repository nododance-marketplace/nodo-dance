'use client'

import { useState, useEffect } from 'react'
import { InstructorCard } from '@/components/instructors/instructor-card'
import { InstructorCardCompact } from '@/components/instructors/instructor-card-compact'
import { InstructorCardTile } from '@/components/instructors/instructor-card-tile'
import { ViewModeToggle } from '@/components/view-mode-toggle'
import { useViewMode } from '@/lib/useViewMode'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, X, Disc3 } from 'lucide-react'
import { DANCE_STYLES, LESSON_TYPES, LOCATION_TYPES } from '@/lib/constants'

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [lessonType, setLessonType] = useState('')
  const [locationType, setLocationType] = useState('')
  const [sortBy, setSortBy] = useState('recommended')
  const [djOnly, setDjOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const { mode: density, setMode: setDensity } = useViewMode('nodo-instructors-density')

  useEffect(() => {
    fetchInstructors()
  }, [search, selectedStyles, lessonType, locationType, sortBy, djOnly])

  async function fetchInstructors() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (selectedStyles.length > 0) params.set('styles', selectedStyles.join(','))
    if (lessonType) params.set('lessonType', lessonType)
    if (locationType) params.set('locationType', locationType)
    if (djOnly) params.set('djOnly', '1')
    params.set('sortBy', sortBy)

    try {
      const response = await fetch(`/api/instructors?${params}`)
      const data = await response.json()
      const instructorsArray = Array.isArray(data) ? data : []
      if (process.env.NODE_ENV !== 'production' && !Array.isArray(data)) {
        console.log('[Instructors] API returned non-array:', data)
      }
      setInstructors(instructorsArray)
    } catch (error) {
      console.error('Error fetching instructors:', error)
      setInstructors([])
    } finally {
      setLoading(false)
    }
  }

  function toggleStyle(style: string) {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    )
  }

  function clearFilters() {
    setSelectedStyles([])
    setLessonType('')
    setLocationType('')
    setDjOnly(false)
    setSortBy('recommended')
  }

  const hasFilters = selectedStyles.length > 0 || lessonType || locationType || djOnly

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">
          Find Your Instructor
        </h1>
        <p className="text-lg text-gray-600">
          Browse experienced dance instructors in {process.env.NEXT_PUBLIC_CITY || 'Charlotte'}
        </p>
      </div>

      {/* Search and Sort */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search by name or neighborhood..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="md:hidden flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasFilters && (
              <Badge variant="primary" className="ml-1">
                {selectedStyles.length + (lessonType ? 1 : 0) + (locationType ? 1 : 0) + (djOnly ? 1 : 0)}
              </Badge>
            )}
          </button>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="recommended">Recommended</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="most-styles">Most Styles</option>
          </Select>
          <button
            onClick={() => setDjOnly(!djOnly)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              djOnly
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            aria-pressed={djOnly}
          >
            <Disc3 className="w-4 h-4" />
            DJs
          </button>
          <ViewModeToggle mode={density} onChange={setDensity} />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filters</h3>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-accent-coral hover:underline flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {/* Dance Styles */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Dance Styles</label>
              <div className="space-y-2">
                {DANCE_STYLES.map((style) => (
                  <label key={style} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedStyles.includes(style)}
                      onChange={() => toggleStyle(style)}
                      className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{style}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Lesson Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Lesson Type</label>
              <Select value={lessonType} onChange={(e) => setLessonType(e.target.value)}>
                <option value="">All</option>
                {LESSON_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Location Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Location Type</label>
              <Select value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                <option value="">All</option>
                {LOCATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="md:col-span-3">
          {loading ? (
            density === 'tile' ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-lg h-14 animate-pulse" />
                ))}
              </div>
            ) : density === 'compact' ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-56 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-96 animate-pulse" />
                ))}
              </div>
            )
          ) : instructors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-600 mb-4">No instructors found</p>
              <p className="text-gray-500">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                {instructors.length} instructor{instructors.length !== 1 ? 's' : ''} found
              </p>
              {density === 'tile' ? (
                <div className="flex flex-col gap-2">
                  {instructors.map((instructor) => (
                    <InstructorCardTile key={instructor.id} instructor={instructor} />
                  ))}
                </div>
              ) : density === 'compact' ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {instructors.map((instructor) => (
                    <InstructorCardCompact key={instructor.id} instructor={instructor} />
                  ))}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {instructors.map((instructor) => (
                    <InstructorCard key={instructor.id} instructor={instructor} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
