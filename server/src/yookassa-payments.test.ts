import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeConfig } from './config'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'
import { createPremiumYooKassaPayment, type YooKassaPayment } from './yookassa'

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(identifier: string): Database['accounts'][number] {
  return {
    accountId: `account_${identifier}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    browserNotificationsEnabled: true,
    createdAt: '2026-04-10T00:00:00.000Z',
    darkThemeEnabled: false,
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    invisibilityAutoEnabled: false,
    invisibilityEnabled: false,
    isTestEntity: false,
    lastActiveAt: '2026-04-10T00:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumBadgeHidden: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    quietModeSettings: undefined,
    soundsDisabled: false,
    staffRole: undefined,
    status: '',
    surname: '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-04-10T00:00:00.000Z',
    expiresAt: '2026-05-10T00:00:00.000Z',
    identifier,
    token,
  })
  return token
}

function seedAcceptedContactLink(database: Database, leftIdentifier: string, rightIdentifier: string) {
  const [left, right] = [leftIdentifier, rightIdentifier].sort()
  database.contactLinks.push({
    createdAt: '2026-04-10T00:00:00.000Z',
    leftIdentifier: left,
    requesterIdentifier: leftIdentifier,
    rightIdentifier: right,
    status: 'accepted',
    updatedAt: '2026-04-10T00:00:00.000Z',
  })
}

function buildSucceededYooKassaPayment(input: {
  amountValue: string
  ownerIdentifier: string
  paymentId: string
  plan: 'month' | 'year'
  purchaseId: string
  targetIdentifier: string
}): YooKassaPayment {
  return {
    amount: {
      currency: 'RUB',
      value: input.amountValue,
    },
    created_at: '2026-04-10T12:00:00.000Z',
    id: input.paymentId,
    metadata: {
      ownerIdentifier: input.ownerIdentifier,
      plan: input.plan,
      purchaseId: input.purchaseId,
      targetIdentifier: input.targetIdentifier,
    },
    paid: true,
    status: 'succeeded',
  }
}

test('createRuntimeConfig parses YooKassa settings and fails closed when required values are missing', () => {
  const config = createRuntimeConfig({
    NODE_ENV: 'production',
    PUBLIC_APP_URL: 'https://staging.tinychok.ru/premium',
    TINYCHOK_CAPTCHA_PROVIDER: 'smartcaptcha',
    TINYCHOK_CAPTCHA_SECRET_KEY: 'captcha-secret',
    TINYCHOK_CAPTCHA_SITE_KEY: 'captcha-site',
    TINYCHOK_PAYMENT_PROVIDER: 'yookassa',
    TINYCHOK_YOOKASSA_RECEIPTS_ENABLED: 'true',
    TINYCHOK_YOOKASSA_RECEIPT_TIMEZONE: '3',
    TINYCHOK_YOOKASSA_RECEIPT_VAT_CODE: '1',
    TINYCHOK_YOOKASSA_SECRET_KEY: 'test-secret',
    TINYCHOK_YOOKASSA_SHOP_ID: 'test-shop',
  })

  assert.equal(config.payments.provider, 'yookassa')
  assert.equal(config.payments.yookassa.publicReturnUrl, 'https://staging.tinychok.ru/premium')
  assert.equal(config.payments.yookassa.receiptsEnabled, true)
  assert.equal(config.payments.yookassa.shopId, 'test-shop')
  assert.equal(config.payments.yookassa.secretKey, 'test-secret')

  assert.throws(
    () =>
      createRuntimeConfig({
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://staging.tinychok.ru/premium',
        TINYCHOK_CAPTCHA_PROVIDER: 'smartcaptcha',
        TINYCHOK_CAPTCHA_SECRET_KEY: 'captcha-secret',
        TINYCHOK_CAPTCHA_SITE_KEY: 'captcha-site',
        TINYCHOK_PAYMENT_PROVIDER: 'yookassa',
      }),
    /YooKassa shop id обязателен/u,
  )
})

test('premium purchase sync grants premium exactly once for the same YooKassa payment', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79990000001')
  database.accounts.push(account)
  const token = createSession(database, account.identifier, 'yookassa-self')

  await store.createPremiumPurchaseDraft(token, {
    amountValue: '199.00',
    plan: 'month',
    provider: 'yookassa',
    purchaseId: 'purchase-self-1',
  })

  const payment = buildSucceededYooKassaPayment({
    amountValue: '199.00',
    ownerIdentifier: account.identifier,
    paymentId: 'payment-self-1',
    plan: 'month',
    purchaseId: 'purchase-self-1',
    targetIdentifier: account.identifier,
  })

  const firstSync = await store.syncPremiumPurchaseFromYooKassaPayment(payment)
  assert.ok(firstSync)
  assert.equal(firstSync.purchase.status, 'succeeded')
  assert.equal(account.premium, true)
  assert.ok(account.premiumExpiresAt)
  const expiresAtAfterFirstSync = account.premiumExpiresAt
  const succeededAt = firstSync.purchase.succeededAt

  const secondSync = await store.syncPremiumPurchaseFromYooKassaPayment(payment)
  assert.ok(secondSync)
  assert.equal(secondSync.purchase.status, 'succeeded')
  assert.equal(secondSync.purchase.succeededAt, succeededAt)
  assert.equal(account.premiumExpiresAt, expiresAtAfterFirstSync)
  assert.deepEqual(secondSync.broadcastIdentifiers, [])
  assert.equal(database.premiumPurchases.length, 1)
})

test('YooKassa webhook sync can recover a gifted premium purchase from provider metadata', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990000002')
  const recipient = createAccount('+79990000003')
  database.accounts.push(owner, recipient)
  createSession(database, owner.identifier, 'yookassa-owner')
  seedAcceptedContactLink(database, owner.identifier, recipient.identifier)

  const payment = buildSucceededYooKassaPayment({
    amountValue: '1390.00',
    ownerIdentifier: owner.identifier,
    paymentId: 'payment-gift-1',
    plan: 'year',
    purchaseId: 'purchase-gift-1',
    targetIdentifier: recipient.identifier,
  })

  const syncResult = await store.syncPremiumPurchaseFromYooKassaPayment(payment)
  assert.ok(syncResult)
  assert.equal(syncResult.purchase.gift, true)
  assert.equal(syncResult.purchase.plan, 'year')
  assert.equal(recipient.premium, true)
  assert.ok(recipient.premiumExpiresAt)
  assert.equal(database.premiumPurchases.length, 1)
  assert.equal(database.premiumPurchases[0]?.ownerIdentifier, owner.identifier)
  assert.equal(database.premiumPurchases[0]?.targetIdentifier, recipient.identifier)
})

test('createPremiumYooKassaPayment sends receipt when receiptEmail is provided even if receiptsEnabled is false', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        amount: {
          currency: 'RUB',
          value: '199.00',
        },
        confirmation: {
          confirmation_url: 'https://yookassa.ru/checkout/test',
          type: 'redirect',
        },
        created_at: '2026-04-17T18:00:00.000Z',
        id: 'payment-test-1',
        paid: false,
        status: 'pending',
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      },
    )
  }) as typeof fetch

  try {
    await createPremiumYooKassaPayment(
      {
        publicReturnUrl: 'https://staging.tinychok.ru/premium',
        receiptTimezone: 3,
        receiptVatCode: 1,
        receiptsEnabled: false,
        secretKey: 'test-secret',
        shopId: 'test-shop',
      },
      {
        amountValue: '199.00',
        description: 'Premium month',
        ownerIdentifier: '+79990000004',
        plan: 'month',
        purchaseId: 'purchase-receipt-1',
        receiptEmail: 'user@example.com',
        targetIdentifier: '+79990000004',
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.ok(requestBody)
  assert.deepEqual(requestBody.receipt, {
    customer: {
      email: 'user@example.com',
      phone: '79990000004',
    },
    internet: 'true',
    items: [
      {
        amount: {
          currency: 'RUB',
          value: '199.00',
        },
        description: 'Premium month',
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
        quantity: 1,
        vat_code: 1,
      },
    ],
    timezone: 3,
  })
})

test('createPremiumYooKassaPayment uses owner phone for the receipt when receipts are enabled', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        amount: {
          currency: 'RUB',
          value: '199.00',
        },
        confirmation: {
          confirmation_url: 'https://yookassa.ru/checkout/test',
          type: 'redirect',
        },
        created_at: '2026-04-17T18:05:00.000Z',
        id: 'payment-test-2',
        paid: false,
        status: 'pending',
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      },
    )
  }) as typeof fetch

  try {
    await createPremiumYooKassaPayment(
      {
        publicReturnUrl: 'https://staging.tinychok.ru/premium',
        receiptTimezone: 3,
        receiptVatCode: 1,
        receiptsEnabled: true,
        secretKey: 'test-secret',
        shopId: 'test-shop',
      },
      {
        amountValue: '199.00',
        description: 'Premium month',
        ownerIdentifier: '+7 (999) 000-00-05',
        plan: 'month',
        purchaseId: 'purchase-receipt-2',
        targetIdentifier: '+79990000005',
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.ok(requestBody)
  assert.deepEqual(requestBody.receipt, {
    customer: {
      phone: '79990000005',
    },
    internet: 'true',
    items: [
      {
        amount: {
          currency: 'RUB',
          value: '199.00',
        },
        description: 'Premium month',
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
        quantity: 1,
        vat_code: 1,
      },
    ],
    timezone: 3,
  })
})
