'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const KINDS = [
  { value: 'TEACHER', label: 'Independent teacher' },
  { value: 'ACADEMY', label: 'Academy / studio' },
  { value: 'ORGANIZER', label: 'DJ / event organizer' },
] as const

/**
 * Create-a-business card for the manage page. Posts to /api/business — all
 * validation, slug generation and membership creation happen server-side.
 */
export function CreateBusinessForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<string>('TEACHER')
  const [city, setCity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind, city }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong')
        setSubmitting(false)
        return
      }
      router.push(`/manage/${data.slug}`)
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  return (
    <section className="section-panel max-w-xl" aria-labelledby="create-business-heading">
      <h2 id="create-business-heading" className="text-2xl font-bold text-primary">
        Create your business
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Set up your studio, teaching profile, or socials in a minute. You become the
        owner and can publish classes and events right away.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="biz-name" className="block text-sm font-medium text-gray-800 mb-1.5">
            Business name
          </label>
          <Input
            id="biz-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            placeholder="Charlotte Salsa Academy"
            autoComplete="organization"
          />
        </div>

        <div>
          <label htmlFor="biz-kind" className="block text-sm font-medium text-gray-800 mb-1.5">
            What best describes it?
          </label>
          <Select id="biz-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="biz-city" className="block text-sm font-medium text-gray-800 mb-1.5">
            City <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <Input
            id="biz-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
            placeholder="Charlotte"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? 'Creating…' : 'Create business'}
        </Button>
      </form>
    </section>
  )
}
