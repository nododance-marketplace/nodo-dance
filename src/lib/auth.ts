import { NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'

const isDev = process.env.NODE_ENV === 'development'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      if (isDev) {
        console.log('🔐 [NextAuth] Sign In Callback:', {
          user: user?.email,
          account: account?.provider,
        })
      }
      return true
    },
    async redirect({ url, baseUrl }) {
      if (isDev) {
        console.log('🔀 [NextAuth] Redirect Callback:', { url, baseUrl })
      }

      // If URL is on same site, allow it
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      }
      // If URL is on same origin, allow it
      else if (new URL(url).origin === baseUrl) {
        return url
      }
      // Default redirect after sign in: go to onboarding (redirects if role already chosen)
      return `${baseUrl}/onboarding`
    },
    async session({ session, user }) {
      if (isDev) {
        console.log('📋 [NextAuth] Session Callback:', {
          userEmail: user?.email,
          userId: user?.id,
        })
      }

      if (session.user) {
        session.user.id = user.id
        // @ts-ignore
        session.user.role = user.role
      }
      return session
    },
  },
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `${isDev ? 'next-auth.session-token' : '__Secure-next-auth.session-token'}`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: !isDev,
      },
    },
  },
  debug: isDev,
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

  if (adminEmails.includes(email)) {
    return true
  }

  return false
}

/** Get the dashboard URL for a given user role */
export function getDashboardUrl(role: string | null | undefined): string {
  if (role === 'INSTRUCTOR') return '/instructor/dashboard'
  return '/account'
}
