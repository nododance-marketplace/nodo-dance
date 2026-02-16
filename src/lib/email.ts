import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
})

const FROM_EMAIL = process.env.EMAIL_FROM || 'Nodo Dance <noreply@nododance.com>'

// Resolve the app URL. On Vercel, auto-detect from system env vars.
// Locally, falls back to localhost.
function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') // trim trailing slashes
  const isUsable = explicit && !explicit.includes('localhost')

  if (isUsable) return explicit

  // Vercel auto-sets these — no config needed
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return explicit || 'http://localhost:3000'
}

const APP_URL = getAppUrl()

if (process.env.VERCEL) {
  console.log('[EMAIL] APP_URL resolved to:', APP_URL)
  console.log('[EMAIL] env debug:', {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL || '(not set)',
    VERCEL_URL: process.env.VERCEL_URL || '(not set)',
  })
}

export async function sendLessonRequestEmail(data: {
  instructorName: string
  instructorEmail: string
  studentName: string
  studentEmail: string
  studentPhone?: string
  style: string
  lessonType: string
  preferredTimes: string
  message: string
}) {
  const instructorHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Inter, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1B1F3B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: linear-gradient(135deg, #FF6F61, #C2185B); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
          .info-row { margin: 10px 0; }
          .label { font-weight: 600; color: #1B1F3B; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Lesson Request!</h1>
          </div>
          <div class="content">
            <p>Hi ${data.instructorName},</p>
            <p>You have a new lesson request from <strong>${data.studentName}</strong>:</p>

            <div class="info-row">
              <span class="label">Email:</span> ${data.studentEmail}
            </div>
            ${data.studentPhone ? `<div class="info-row"><span class="label">Phone:</span> ${data.studentPhone}</div>` : ''}
            <div class="info-row">
              <span class="label">Dance Style:</span> ${data.style}
            </div>
            <div class="info-row">
              <span class="label">Lesson Type:</span> ${data.lessonType}
            </div>
            <div class="info-row">
              <span class="label">Preferred Times:</span> ${data.preferredTimes}
            </div>
            <div class="info-row">
              <span class="label">Message:</span><br/>
              ${data.message}
            </div>

            <p style="margin-top: 30px;">
              <a href="mailto:${data.studentEmail}" class="button">Reply to ${data.studentName}</a>
            </p>
          </div>
          <div class="footer">
            <p>Nodo Dance - ${process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'}</p>
          </div>
        </div>
      </body>
    </html>
  `

  const studentHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Inter, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1B1F3B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Lesson Request Sent!</h1>
          </div>
          <div class="content">
            <p>Hi ${data.studentName},</p>
            <p>Your lesson request has been sent to <strong>${data.instructorName}</strong>.</p>
            <p>They will contact you directly at <strong>${data.studentEmail}</strong> to schedule your lesson.</p>
            <p>Thank you for using Nodo Dance!</p>
          </div>
          <div class="footer">
            <p>Nodo Dance - ${process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'}</p>
          </div>
        </div>
      </body>
    </html>
  `

  await Promise.all([
    transporter.sendMail({
      from: FROM_EMAIL,
      to: data.instructorEmail,
      subject: `New Lesson Request from ${data.studentName}`,
      html: instructorHtml,
    }),
    transporter.sendMail({
      from: FROM_EMAIL,
      to: data.studentEmail,
      subject: 'Your Lesson Request Has Been Sent',
      html: studentHtml,
    }),
  ])
}

export async function sendEventSubmissionEmail(data: {
  eventTitle: string
  organizerName: string
  organizerEmail: string
  eventType: string
}) {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || []

  if (adminEmails.length === 0) {
    console.warn('No admin emails configured for event notifications')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Inter, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1B1F3B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: linear-gradient(135deg, #FF6F61, #C2185B); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Event Pending Approval</h1>
          </div>
          <div class="content">
            <p><strong>Event:</strong> ${data.eventTitle}</p>
            <p><strong>Type:</strong> ${data.eventType}</p>
            <p><strong>Organizer:</strong> ${data.organizerName} (${data.organizerEmail})</p>

            <p style="margin-top: 30px;">
              <a href="${APP_URL}/admin" class="button">Review in Admin Panel</a>
            </p>
          </div>
          <div class="footer">
            <p>Nodo Dance Admin</p>
          </div>
        </div>
      </body>
    </html>
  `

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: adminEmails.join(','),
    subject: `New Event: ${data.eventTitle}`,
    html,
  })
}
