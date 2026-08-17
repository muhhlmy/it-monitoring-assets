import * as XLSX from 'xlsx'
import assert from 'node:assert/strict'
import test from 'node:test'

import { exportToCsv, exportToExcel, exportToPdf } from '../src/utils/exportEngine.js'

function installDownloadHarness(t) {
  const originalDocument = globalThis.document
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  let downloadedBlob
  let downloadedFilename

  globalThis.document = {
    createElement: () => ({
      click() {},
      set href(_value) {},
      set download(value) {
        downloadedFilename = value
      },
    }),
    body: {
      appendChild() {},
      removeChild() {},
    },
  }
  URL.createObjectURL = (blob) => {
    downloadedBlob = blob
    return 'blob:test-export'
  }
  URL.revokeObjectURL = () => {}

  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
  })

  return {
    get blob() {
      return downloadedBlob
    },
    get filename() {
      return downloadedFilename
    },
  }
}

test('CSV export neutralizes spreadsheet formula prefixes', async (t) => {
  const download = installDownloadHarness(t)

  const exported = exportToCsv(
    [
      {
        formula: '=HYPERLINK("https://example.test")',
        spacedFormula: ' \t-10+20',
        negativeNumber: -10,
        safe: 'ordinary text',
      },
    ],
    [
      { name: 'formula', label: 'Formula' },
      { name: 'spacedFormula', label: 'Spaced Formula' },
      { name: 'negativeNumber', label: 'Negative Number' },
      { name: 'safe', label: 'Safe' },
    ],
    'Security_Test',
  )

  assert.equal(exported, true)
  assert.ok(download.blob)
  assert.match(download.filename, /^Security_Test_\d{8}_\d{4}\.csv$/)

  const content = await download.blob.text()
  assert.equal(content.includes('"=HYPERLINK'), false)
  assert.equal(content.includes('" \t-10+20"'), false)
  assert.ok(content.includes(`"'=HYPERLINK`))
  assert.ok(content.includes(`"' \t-10+20"`))
  assert.ok(content.includes('"-10"'))
  assert.equal(content.includes(`"'-10"`), false)
  assert.ok(content.includes('"ordinary text"'))
})

test('Excel export generates native xlsx binary spreadsheet with formula neutralization', async (t) => {
  const download = installDownloadHarness(t)
  const maliciousMarkup = '<img src=x onerror="globalThis.compromised=true">'

  const exported = exportToExcel(
    [{ value: maliciousMarkup, formula: '=2+2' }],
    [
      { name: 'value', label: '<script>header()</script>' },
      { name: 'formula', label: 'Formula' },
    ],
    '<svg onload="tableNameAttack()">',
    'Security_Test',
  )

  assert.equal(exported, true)
  assert.ok(download.blob)
  assert.equal(
    download.blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  assert.match(download.filename, /\.xlsx$/)

  const buffer = await download.blob.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  assert.ok(wb.SheetNames.length > 0)
  const ws = wb.Sheets[wb.SheetNames[0]]
  assert.equal(ws['B2']?.v, "'=2+2")
})

test('PDF print document escapes cells, labels, titles, and filters', (t) => {
  const originalWindow = globalThis.window
  const originalAlert = globalThis.alert
  let writtenHtml = ''

  globalThis.window = {
    open: () => ({
      document: {
        write(value) {
          writtenHtml = value
        },
        close() {},
      },
    }),
  }
  globalThis.alert = () => {
    throw new Error('The print window should be available in this test.')
  }
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalAlert === undefined) delete globalThis.alert
    else globalThis.alert = originalAlert
  })

  const maliciousScript = '<script>globalThis.compromised=true</script>'
  const exported = exportToPdf(
    [{ description: maliciousScript }],
    [{ name: 'description', label: '<img src=x onerror=headerAttack()>' }],
    '<svg onload=tableAttack()>',
    '<iframe srcdoc=titleAttack()>',
    { '<b>Filter</b>': '<img src=x onerror=filterAttack()>' },
  )

  assert.equal(exported, true)
  assert.equal(writtenHtml.includes(maliciousScript), false)
  assert.equal(writtenHtml.includes('<img src=x onerror=headerAttack()>'), false)
  assert.equal(writtenHtml.includes('<svg onload=tableAttack()>'), false)
  assert.equal(writtenHtml.includes('<iframe srcdoc=titleAttack()>'), false)
  assert.equal(writtenHtml.includes('<b>Filter</b>'), false)
  assert.ok(writtenHtml.includes('&lt;script&gt;globalThis.compromised=true&lt;/script&gt;'))
  assert.ok(writtenHtml.includes('&lt;img src=x onerror=filterAttack()&gt;'))
})
