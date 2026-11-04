import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default function ErrorPage() {
  return (
    <div className="min-h-[70svh] flex items-center justify-center px-4 py-12 sm:py-16">
      <Card className="max-w-lg w-full">
        <CardContent className="p-6 sm:p-10">
          <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Authentication Error</h1>
          <p className="text-gray-600 mb-6">
            There was a problem signing you in. The link may have expired or already been used.
          </p>
          <Link href="/auth/signin">
            <Button variant="gradient">Try Again</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
