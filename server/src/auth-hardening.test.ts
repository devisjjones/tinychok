import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthEntrypoint, AuthRequestCodeFlow } from '../../src/shared/backend'
import { parseRequestCodeBody, parseVerifyCodeBody } from './auth-route-validation'
import { createRuntimeConfig } from './config'
import { HttpError } from './http-error'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'

const originalConsoleInfo = console.info

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function isoMsAgo(milliseconds: number) {
  return new Date(Date.now() - milliseconds).toISOString()
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(identifier: string, options?: { passwordHash?: string; staffRole?: 'owner' | 'moderator' | 'support' }) {
  return {
    accountId: `account_${identifier}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: '2026-03-28T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-03-28T00:00:00.000Z',
    nickname: '',
    passwordHash: options?.passwordHash,
    passwordSetAt: options?.passwordHash ? '2026-03-28T00:00:00.000Z' : undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    soundsDisabled: true,
    staffRole: options?.staffRole,
    status: '',
    surname: '',
  }
}

async function seedSuccessfulRequest(
  store: TinychokStore,
  database: Database,
  identifier: string,
  createdAt: string,
  options?: { entryPoint?: AuthEntrypoint; flow?: AuthRequestCodeFlow; ip?: string },
) {
  await store.requestCode(identifier, options)
  database.authCodeSendAttempts[database.authCodeSendAttempts.length - 1]!.createdAt = createdAt
}

test.before(() => {
  console.info = () => undefined
})

test.after(() => {
  console.info = originalConsoleInfo
})

test('request/verify auth parsers reject unknown enum values', () => {
  assert.throws(
    () => parseRequestCodeBody({ entryPoint: 'superadmin', flow: 'default', identifier: '+79990000001' }),
    (error) => error instanceof HttpError && error.statusCode === 400,
  )
  assert.throws(
    () => parseRequestCodeBody({ entryPoint: 'user', flow: 'something-else', identifier: '+79990000001' }),
    (error) => error instanceof HttpError && error.statusCode === 400,
  )
  assert.throws(
    () => parseVerifyCodeBody({ entryPoint: 'backdoor', code: '1111', identifier: '+79990000001' }),
    (error) => error instanceof HttpError && error.statusCode === 400,
  )
})

test('requestCode enforces per-identifier cooldown', async () => {
  const store = createStore()

  await store.requestCode('+79990000001')
  await assert.rejects(
    () => store.requestCode('+79990000001'),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )
})

test('requestCode enforces per-identifier hourly limit', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(55 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(35 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(15 * 60 * 1000))

  await assert.rejects(
    () => store.requestCode('+79990000001'),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )
})

test('requestCode enforces per-identifier daily limit outside hourly window', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(23 * 60 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(18 * 60 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(13 * 60 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(8 * 60 * 60 * 1000))
  await seedSuccessfulRequest(store, database, '+79990000001', isoMsAgo(3 * 60 * 60 * 1000))

  await assert.rejects(
    () => store.requestCode('+79990000001'),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )
})

test('requestCode enforces per-ip hourly and daily limits', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const ip = '198.51.100.10'

  for (let index = 0; index < 10; index += 1) {
    await seedSuccessfulRequest(
      store,
      database,
      `+799900001${String(index).padStart(2, '0')}`,
      isoMsAgo((59 - index) * 60 * 1000),
      { ip },
    )
  }

  await assert.rejects(
    () => store.requestCode('+79990000200', { ip }),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )

  database.authCodeSendAttempts = []

  for (let index = 0; index < 20; index += 1) {
    await seedSuccessfulRequest(
      store,
      database,
      `+799900003${String(index).padStart(2, '0')}`,
      isoMsAgo((23 - index) * 60 * 60 * 1000),
      { ip },
    )
  }

  await assert.rejects(
    () => store.requestCode('+79990000400', { ip }),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )
})

test('requestCode enforces global daily limit', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  for (let index = 0; index < 500; index += 1) {
    await seedSuccessfulRequest(
      store,
      database,
      `+79991${String(index).padStart(6, '0')}`,
      isoMsAgo(((index % 24) * 60 * 60 * 1000) + ((index % 60) * 60 * 1000)),
    )
  }

  await assert.rejects(
    () => store.requestCode('+79991999999'),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )
})

test('admin requestCode is staff-only while user password flow still skips SMS', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  database.accounts.push(
    createAccount('+79990000001', { passwordHash: 'hash', staffRole: 'owner' }),
    createAccount('+79990000002', { passwordHash: 'hash' }),
  )

  const staffResponse = await store.requestCode('+79990000001', { entryPoint: 'admin', ip: '203.0.113.10' })
  assert.equal(staffResponse.status, 'code-sent')

  const userResponse = await store.requestCode('+79990000002', { entryPoint: 'user' })
  assert.equal(userResponse.status, 'needs-password-login')

  await assert.rejects(
    () => store.requestCode('+79990000002', { entryPoint: 'admin', ip: '203.0.113.10' }),
    (error) => error instanceof HttpError && error.statusCode === 403,
  )
})

test('blocked user requestCode returns blocked without creating sms challenge', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  database.accounts.push({
    ...createAccount('+79990000014', { passwordHash: 'hash' }),
    blockedAt: '2026-03-28T10:00:00.000Z',
    blockedReason: 'Аккаунт ограничен staff-командой.',
  })

  const response = await store.requestCode('+79990000014', { entryPoint: 'user' })
  assert.equal(response.status, 'blocked')
  assert.equal(database.authChallenges.length, 0)
  assert.equal(database.authCodeSendAttempts.length, 0)
})

test('admin auth challenge survives parallel user auth challenge for the same identifier', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  database.accounts.push(createAccount('+79990000015', { staffRole: 'owner' }))

  const adminResponse = await store.requestCode('+79990000015', {
    entryPoint: 'admin',
    ip: '203.0.113.15',
  })
  assert.equal(adminResponse.status, 'code-sent')
  database.authCodeSendAttempts[database.authCodeSendAttempts.length - 1]!.createdAt = isoMsAgo(2 * 60 * 1000)

  const userResponse = await store.requestCode('+79990000015', {
    entryPoint: 'user',
    flow: 'default',
  })
  assert.equal(userResponse.status, 'needs-sms-password-setup')
  assert.equal(
    database.authChallenges.filter((challenge) => challenge.identifier === '+79990000015').length,
    2,
  )

  const verifyResponse = await store.verifyCode('+79990000015', '1111', {
    accessContext: { ip: '203.0.113.15', userAgent: 'test' },
    entryPoint: 'admin',
  })
  assert.equal(verifyResponse.status, 'authenticated')
  assert.equal(
    database.authChallenges.some(
      (challenge) =>
        challenge.identifier === '+79990000015' && challenge.purpose === 'password-setup',
    ),
    true,
  )
})

test('admin verifyCode never authenticates non-staff account', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  database.accounts.push(createAccount('+79990000003'))
  database.authChallenges.push({
    code: '1111',
    expiresAt: '2099-01-01T00:00:00.000Z',
    identifier: '+79990000003',
    purpose: 'admin',
  })

  await assert.rejects(
    () =>
      store.verifyCode('+79990000003', '1111', {
        accessContext: { ip: '203.0.113.11', userAgent: 'test' },
        entryPoint: 'admin',
      }),
    (error) => error instanceof HttpError && error.statusCode === 403,
  )

  assert.equal(database.sessions.length, 0)
})

test('registration, password reset and staff admin login happy paths remain valid', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)

  const registrationResponse = await store.requestCode('+79990000011')
  assert.equal(registrationResponse.status, 'needs-sms-registration')

  database.accounts.push(createAccount('+79990000012'))
  const resetResponse = await store.requestCode('+79990000012', { flow: 'password-reset' })
  assert.equal(resetResponse.status, 'needs-sms-reset')

  database.accounts.push(createAccount('+79990000013', { staffRole: 'owner' }))
  const adminRequestResponse = await store.requestCode('+79990000013', { entryPoint: 'admin', ip: '203.0.113.12' })
  assert.equal(adminRequestResponse.status, 'code-sent')

  const adminVerifyResponse = await store.verifyCode('+79990000013', '1111', {
    accessContext: { ip: '203.0.113.12', userAgent: 'test' },
    entryPoint: 'admin',
  })
  assert.equal(adminVerifyResponse.status, 'authenticated')
  assert.ok(adminVerifyResponse.snapshot.session.sessionToken)
})

test('createRuntimeConfig fails closed for staging/production captcha and allows development fallback', () => {
  assert.throws(
    () => createRuntimeConfig({ NODE_ENV: 'production' }),
    /Captcha должна быть включена/u,
  )
  assert.throws(
    () =>
      createRuntimeConfig({
        TINYCHOK_APP_ENV: 'staging',
        TINYCHOK_CAPTCHA_PROVIDER: 'smartcaptcha',
      }),
    /Captcha site key обязателен/u,
  )

  const developmentConfig = createRuntimeConfig({ NODE_ENV: 'development' })
  assert.equal(developmentConfig.environment, 'development')
  assert.equal(developmentConfig.auth.captcha.provider, 'disabled')
})
