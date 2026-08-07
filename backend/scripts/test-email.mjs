import 'dotenv/config'
import { renderTicketEmailHtml, sendEmail } from '../src/services/emailService.js'

console.log('--- Testing Email Template Generator ---')

const sampleHtml = renderTicketEmailHtml({
  recipientName: 'Budi Santoso',
  title: '[TIKET-#1042] Tiket Baru Berhasil Dibuat',
  subtitle: 'Tiket Anda telah berhasil dibuat dan sedang diproses oleh Tim IT Support.',
  ticket: {
    id: 1042,
    nomor_tiket: 'TKT-202608-0042',
    judul: 'Printer Kantor Lantai 2 Macet & Tidak Respond',
    status_tiket: 'Open',
    prioritas: 'Urgent (4h)',
  },
  changes: ['Status tiket diubah menjadi: Open'],
  commentPesan: 'Mohon dibantu secepatnya karena sedang cetak laporan bulanan.',
  commentAuthor: 'Budi Santoso (Pelapor)',
})

console.log('✓ Email HTML Rendered Length:', sampleHtml.length, 'bytes')
console.log('✓ Contains Title:', sampleHtml.includes('TKT-202608-0042'))

console.log('\n--- Testing sendEmail Function ---')
const success = await sendEmail({
  to: 'test-recipient@example.com',
  subject: 'Test Email Notification System',
  html: sampleHtml,
  text: 'Test notification body',
})

console.log('✓ sendEmail result (expected false if SMTP unconfigured):', success)
console.log('\n✅ Email service test script completed successfully.')
