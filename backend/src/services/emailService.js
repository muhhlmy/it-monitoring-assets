import nodemailer from 'nodemailer'

let transporter = null

export function getTransporter() {
  const enabled = process.env.EMAIL_ENABLED !== 'false'
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!enabled || !host || !user || !pass) {
    return null
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = process.env.SMTP_SECURE === 'true'

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    })
  }

  return transporter
}

/**
 * Send an email asynchronously. Fails gracefully if SMTP is disabled or unconfigured.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return false

  const activeTransporter = getTransporter()
  if (!activeTransporter) {
    console.log(`[emailService] Skip sending email to <${to}> (SMTP disabled or missing credentials). Subject: "${subject}"`)
    return false
  }

  const from = process.env.EMAIL_FROM || '"IT Support" <no-reply@it-monitoring.local>'

  try {
    const info = await activeTransporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    })
    console.log(`[emailService] Email sent successfully to <${to}>: ${info.messageId}`)
    return true
  } catch (error) {
    console.error(`[emailService] Failed to send email to <${to}>:`, error.message)
    return false
  }
}

/**
 * Helper to render HTML email for ticket events
 */
export function renderTicketEmailHtml({
  recipientName,
  title,
  subtitle,
  ticket,
  actionText,
  changes = [],
  commentPesan = null,
  commentAuthor = null,
}) {
  const nomorTiket = ticket?.nomor_tiket || `TIKET-#${ticket?.id || ''}`
  const judulTiket = ticket?.judul || '-'
  const statusTiket = ticket?.status_tiket || '-'
  const prioritasTiket = ticket?.prioritas || '-'

  const statusColorMap = {
    Open: '#ef4444',
    'In Progress': '#3b82f6',
    Pending: '#f59e0b',
    Resolved: '#10b981',
    Closed: '#6b7280',
    Cancelled: '#9ca3af',
  }
  const statusBg = statusColorMap[statusTiket] || '#4b5563'

  let changesListHtml = ''
  if (Array.isArray(changes) && changes.length > 0) {
    changesListHtml = `
      <div style="margin-top: 16px; padding: 12px; background-color: #f3f4f6; border-radius: 6px; border-left: 4px solid #3b82f6;">
        <strong style="color: #1f2937; font-size: 14px;">Detail Perubahan:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #374151; font-size: 13px;">
          ${changes.map((c) => `<li style="margin-bottom: 4px;">${c}</li>`).join('')}
        </ul>
      </div>
    `
  }

  let commentBoxHtml = ''
  if (commentPesan) {
    commentBoxHtml = `
      <div style="margin-top: 16px; padding: 14px; background-color: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">
        <div style="font-size: 12px; font-weight: 600; color: #1e40af; margin-bottom: 6px;">
          Komentar oleh ${commentAuthor || 'Pengguna'}:
        </div>
        <div style="font-size: 14px; color: #1e293b; white-space: pre-wrap; font-style: italic;">
          "${commentPesan}"
        </div>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f5f7; margin: 0; padding: 20px; color: #1f2937;">
  <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 24px 32px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">IT Monitoring & Asset System</h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Notifikasi Layanan Tiket IT</p>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <p style="font-size: 15px; margin-top: 0;">Halo <strong>${recipientName || 'Pengguna'}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px;">
          ${subtitle}
        </p>

        <!-- Ticket Card -->
        <table role="presentation" style="width: 100%; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <tr>
            <td>
              <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">${nomorTiket}</div>
              <div style="font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 4px;">${judulTiket}</div>
              
              <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center;">
                <span style="background-color: ${statusBg}; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                  ${statusTiket}
                </span>
                <span style="background-color: #e2e8f0; color: #334155; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; margin-left: 6px;">
                  Prioritas: ${prioritasTiket}
                </span>
              </div>
            </td>
          </tr>
        </table>

        ${changesListHtml}
        ${commentBoxHtml}

        <!-- Footer Call to Action -->
        <div style="margin-top: 28px; text-align: center;">
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 16px;">
            ${actionText || 'Silakan buka aplikasi untuk melihat detail atau merespon tiket ini.'}
          </p>
        </div>
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="background-color: #f9fafb; padding: 16px 32px; text-align: center; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
        Email ini dikirim secara otomatis oleh Sistem IT Monitoring. Mohon tidak membalas langsung email ini.
      </td>
    </tr>
  </table>
</body>
</html>
  `
}
