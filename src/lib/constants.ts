export const DANCE_STYLES = [
  'Salsa',
  'Bachata',
  'Kizomba',
  'Tango',
  'Zouk',
  'Other',
] as const

export const SKILL_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
] as const

export const LOCATION_TYPES = [
  { value: 'STUDIO', label: 'My Studio/Space' },
  { value: 'DANCE_SCHOOL', label: 'Dance School' },
  { value: 'TRAVEL_TO_STUDENT', label: 'I travel to you' },
  { value: 'FLEXIBLE', label: 'Flexible/Meet halfway' },
] as const

export const EVENT_TYPES = [
  { value: 'SOCIAL', label: 'Social' },
  { value: 'TANGO_MILONGA', label: 'Tango Social (Milonga)' },
  { value: 'GROUP_CLASS', label: 'Group Class' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'FESTIVAL', label: 'Festival' },
] as const

export const LESSON_TYPES = [
  { value: 'PRIVATE', label: 'Private' },
  { value: 'GROUP', label: 'Group' },
  { value: 'EITHER', label: 'Either' },
] as const

export const INSTRUCTOR_OFFERINGS = [
  'Private lessons',
  'Group class',
  'Workshops',
  'Choreography',
  'Wedding dance',
  'DJ services',
  'Event hosting',
] as const

export const LANGUAGES = [
  'English',
  'Spanish',
  'Portuguese',
  'French',
  'Italian',
  'Other',
] as const
