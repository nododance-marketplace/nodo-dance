import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default function ErrorPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Authentication Error</h1>
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
