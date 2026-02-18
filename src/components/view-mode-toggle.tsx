'use client'

import { LayoutGrid, List, StretchHorizontal } from 'lucide-react'
import type { ViewMode } from '@/lib/useViewMode'
import { cn } from '@/lib/utils'

interface ViewModeToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

const modes: { value: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'comfortable', label: 'Comfortable', Icon: StretchHorizontal },
  { value: 'compact', label: 'Compact', Icon: LayoutGrid },
  { value: 'tile', label: 'Tile', Icon: List },
]

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1" role="group" aria-label="View density">
      {modes.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          aria-label={`${label} view`}
          title={label}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            mode === value
              ? 'bg-white shadow-sm text-primary'
              : 'text-gray-400 hover:text-gray-600'
          )}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  )
}
