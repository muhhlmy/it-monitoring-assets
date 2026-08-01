import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_ATTACHMENT_BYTES,
  validateAttachmentFile,
} from '../src/utils/attachmentPolicy.js'

test('frontend attachment policy memakai MIME allowlist yang sempit', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    assert.equal(validateAttachmentFile({ type, size: 100 }), null)
  }

  assert.match(
    validateAttachmentFile({ type: 'image/svg+xml', size: 100 }),
    /PNG, JPEG, GIF, atau WebP/,
  )
  assert.match(
    validateAttachmentFile({ type: 'text/html', size: 100 }),
    /PNG, JPEG, GIF, atau WebP/,
  )
})

test('frontend attachment policy membatasi ticket dan comment pada 5 MiB', () => {
  assert.equal(
    validateAttachmentFile({ type: 'image/png', size: MAX_ATTACHMENT_BYTES }),
    null,
  )
  assert.match(
    validateAttachmentFile({
      type: 'image/png',
      size: MAX_ATTACHMENT_BYTES + 1,
    }),
    /maksimal 5 MiB/,
  )
})
