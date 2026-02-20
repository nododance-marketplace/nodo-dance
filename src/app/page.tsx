import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AnimatedNodes } from '@/components/ui/animated-nodes'
import { Users, Calendar, Heart, MapPin } from 'lucide-react'
import { DANCE_STYLES } from '@/lib/constants'
import { DANCE_STYLE_COLORS } from '@/lib/styleColors'

export default function HomePage() {
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary via-primary-light to-primary-dark text-white overflow-hidden">
        <AnimatedNodes />
        {/* Vignette overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/20 pointer-events-none z-[1]" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tighter leading-tight">
              nodo dance
            </h1>
            <p className="text-xl md:text-2xl mb-4 text-gray-200 font-medium">
              {city}&apos;s Partner Dance Hub
            </p>
            <p className="text-lg md:text-xl mb-10 text-gray-300 font-normal">
              Find instructors, discover events, and join the vibrant dance community
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/instructors">
                <Button variant="gradient" size="lg" className="w-full sm:w-auto">
                  <Users className="w-5 h-5 mr-2" />
                  Find Instructors
                </Button>
              </Link>
              <Link href="/events">
                <Button size="lg" className="w-full sm:w-auto bg-white text-primary hover:bg-gray-100">
                  <Calendar className="w-5 h-5 mr-2" />
                  Explore Events
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-primary mb-4 tracking-tight">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-accent-coral to-accent-magenta rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  1
                </div>
                <h3 className="text-xl font-display font-semibold mb-3">Browse</h3>
                <p className="text-gray-600">
                  Explore our directory of experienced dance instructors and upcoming events
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-accent-magenta to-accent-orange rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  2
                </div>
                <h3 className="text-xl font-display font-semibold mb-3">Connect</h3>
                <p className="text-gray-600">
                  Request lessons with instructors or register for events that interest you
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-accent-orange to-accent-coral rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  3
                </div>
                <h3 className="text-xl font-display font-semibold mb-3">Dance</h3>
                <p className="text-gray-600">
                  Start your dance journey and become part of our vibrant community
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Dance Styles */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-primary mb-4 tracking-tight">
              Dance Styles We Love
            </h2>
            <p className="text-lg text-gray-600">
              Find instructors and events for your favorite partner dance
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {DANCE_STYLES.filter((s) => s !== 'Other').map((style) => (
              <Card key={style} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6 text-center">
                  <Heart
                    className="w-10 h-10 mx-auto mb-3"
                    style={{ color: DANCE_STYLE_COLORS[style] || DANCE_STYLE_COLORS.Other }}
                  />
                  <h3 className="text-lg font-display font-semibold">{style}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Sections */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Submit Event */}
            <Card className="bg-gradient-to-br from-accent-coral/10 to-accent-magenta/10 border-accent-coral/20">
              <CardContent className="pt-6">
                <Calendar className="w-12 h-12 text-accent-coral mb-4" />
                <h3 className="text-2xl font-display font-bold mb-3">Have an Event?</h3>
                <p className="text-gray-700 mb-6">
                  Share your dance social, workshop, or festival with the community. It&apos;s free!
                </p>
                <Link href="/submit-event">
                  <Button variant="gradient">Submit an Event</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Become Instructor */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary-light/10 border-primary/20">
              <CardContent className="pt-6">
                <Users className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-2xl font-display font-bold mb-3">Teach Dance?</h3>
                <p className="text-gray-700 mb-6">
                  Join our directory and connect with students looking for instructors like you.
                </p>
                <Link href="/become-an-instructor">
                  <Button>Become an Instructor</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="py-16 bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <MapPin className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-3 tracking-tight">
            Proudly Serving {city}
          </h2>
          <p className="text-gray-300 max-w-2xl mx-auto">
            We&apos;re building the largest partner dance community in Charlotte. Join us!
          </p>
        </div>
      </section>
    </div>
  )
}
