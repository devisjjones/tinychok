import assert from 'node:assert/strict'
import test from 'node:test'

import {
  preserveMatchedOutgoingAttachmentPreview,
  reconcileOutgoingItems,
} from '../../src/app/outgoingMessageReconciliation'

test('reconcileOutgoingItems preserves local media preview on the confirmed outgoing message', () => {
  const localMessage = {
    attachment: {
      fileName: 'cat.gif',
      mediaUrl: 'blob:preview-cat',
      mimeType: 'image/gif',
      size: 1024,
    },
    deliveryId: 'delivery-cat',
    localId: -7,
  }
  const confirmedMessage = {
    attachment: {
      fileName: 'cat.gif',
      mediaUrl: 'https://cdn.tinychok.ru/cat.gif',
      mimeType: 'image/gif',
      size: 1024,
    },
    deliveryId: 'delivery-cat',
    id: 701,
  }

  const reconciled = reconcileOutgoingItems(
    [localMessage],
    [confirmedMessage],
    (localItem, confirmedItem) => localItem.deliveryId === confirmedItem.deliveryId,
    preserveMatchedOutgoingAttachmentPreview,
  )

  assert.deepEqual(reconciled.unconfirmedLocalItems, [])
  assert.equal(reconciled.confirmedItems[0]?.attachment?.mediaUrl, 'blob:preview-cat')
})

test('reconcileOutgoingItems keeps unmatched optimistic messages queued locally', () => {
  const localMessage = {
    attachment: undefined,
    deliveryId: 'delivery-pending',
    localId: -3,
  }
  const confirmedMessage = {
    attachment: undefined,
    deliveryId: 'delivery-other',
    id: 303,
  }

  const reconciled = reconcileOutgoingItems(
    [localMessage],
    [confirmedMessage],
    (localItem, confirmedItem) => localItem.deliveryId === confirmedItem.deliveryId,
    preserveMatchedOutgoingAttachmentPreview,
  )

  assert.deepEqual(reconciled.unconfirmedLocalItems, [localMessage])
  assert.deepEqual(reconciled.confirmedItems, [confirmedMessage])
})
