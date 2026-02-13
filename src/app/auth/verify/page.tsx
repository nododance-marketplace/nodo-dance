import { Card, CardContent } from '@/components/ui/card'
import { Mail } from 'lucide-react'

export default function VerifyPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <Mail className="w-16 h-16 text-accent-coral mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Check Your Email</h1>
          <p className="text-gray-600">
            A sign-in link has been sent to your email address. Click the link to continue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
