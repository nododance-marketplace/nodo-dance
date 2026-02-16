import { NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { createTransport } from 'nodemailer'
import { prisma } from './prisma'

const isDev = process.env.NODE_ENV === 'development'

// Validate required email env vars at import time (runs once on cold start)
const REQUIRED_EMAIL_VARS = [
  'EMAIL_SERVER_HOST',
  'EMAIL_SERVER_USER',
  'EMAIL_SERVER_PASSWORD',
  'EMAIL_FROM',
] as const

const missingEmailVars = REQUIRED_EMAIL_VARS.filter((v) => !process.env[v])
if (missingEmailVars.length > 0) {
  console.error(
    `[AUTH] FATAL: Missing required email env vars: ${missingEmailVars.join(', ')}. Magic link emails WILL NOT send.`
  )
}

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
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const { host } = new URL(url)
        const transport = createTransport(provider.server)

        console.log(`[AUTH] Sending magic link to ${email} (via ${process.env.EMAIL_SERVER_HOST}, from ${provider.from})`)
        console.log(`[AUTH] Magic link host: ${host}, URL prefix: ${url.substring(0, 60)}...`)

        try {
          const result = await transport.sendMail({
            to: email,
            from: provider.from,
            subject: `Sign in to Nodo Dance`,
            text: `Sign in to Nodo Dance\n\n${url}\n\n`,
            html: `
              <div style="max-width: 600px; margin: 0 auto; font-family: sans-serif;">
                <div style="background: #1B1F3B; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">Nodo Dance</h1>
                </div>
                <div style="background: white; padding: 32px; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; color: #333;">Click the button below to sign in:</p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #FF6F61, #C2185B); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Sign in to Nodo Dance
                    </a>
                  </div>
                  <p style="font-size: 14px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
                  <p style="font-size: 12px; color: #999; margin-top: 24px;">
                    Or copy this link: <a href="${url}" style="color: #999;">${url}</a>
                  </p>
                </div>
              </div>
            `,
          })
          console.log(`[AUTH] Email sent successfully to ${email}. MessageId: ${result.messageId}, Response: ${result.response}`)
        } catch (error) {
          console.error(`[AUTH] FAILED to send magic link to ${email}:`, error)
          throw error // re-throw so NextAuth surfaces the error to the user
        }
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }) {
      console.log('[AUTH] Sign-in attempt:', { email: user?.email, provider: account?.provider })
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('[AUTH] Redirect:', { url, baseUrl })

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
      if (session.user) {
        session.user.id = user.id
        // @ts-ignore
        session.user.role = user.role
        // @ts-ignore
        session.user.isAdmin = isAdmin(user.email)
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
