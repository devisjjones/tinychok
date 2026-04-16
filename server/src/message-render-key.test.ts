import assert from 'node:assert/strict'
import test from 'node:test'

import { getOptimisticMessageRenderKey } from '../../src/shared/utils'

test('getOptimisticMessageRenderKey keeps optimistic and confirmed copies on the same render key', () => {
  const optimisticMessage = {
    deliveryId: 'delivery-42',
    id: -42,
  }
  const confirmedMessage = {
    deliveryId: 'delivery-42',
    id: 1042,
  }

  assert.equal(
    getOptimisticMessageRenderKey(optimisticMessage),
    getOptimisticMessageRenderKey(confirmedMessage),
  )
})

test('getOptimisticMessageRenderKey falls back to message id when no delivery id exists', () => {
  assert.equal(
    getOptimisticMessageRenderKey({
      id: 77,
    }),
    'message:77',
  )
})

test('getOptimisticMessageRenderKey trims delivery ids before building the key', () => {
  assert.equal(
    getOptimisticMessageRenderKey({
      deliveryId: '  delivery-77  ',
      id: -77,
    }),
    'delivery:delivery-77',
  )
})
