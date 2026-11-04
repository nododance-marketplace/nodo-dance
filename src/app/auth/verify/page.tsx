import { Card, CardContent } from '@/components/ui/card'
import { Mail } from 'lucide-react'

export default function VerifyPage() {
  return (
    <div className="min-h-[70svh] flex items-center justify-center px-4 py-12 sm:py-16">
      <Card className="max-w-lg w-full">
        <CardContent className="p-6 sm:p-10">
          <Mail className="w-16 h-16 text-accent-coral mb-6" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">Check Your Email</h1>
          <p className="text-gray-600">
            A sign-in link has been sent to your email address. Click the link to continue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
