import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { EventDetailsView } from "@/components/events/event-details-view"

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [event, session] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
    }),
    getServerSession(authOptions),
  ])

  if (!event || event.status !== "APPROVED") {
    notFound()
  }

  const isLoggedIn = !!session?.user?.email

  return <EventDetailsView event={event} isLoggedIn={isLoggedIn} />
}

