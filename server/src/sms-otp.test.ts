import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeConfig } from './config'
import { HttpError } from './http-error'
import {
  assertPublicClientIp,
  buildSmsOtpHash,
  createSmsRuOtpSender,
  generateSmsOtpCode,
  verifySmsOtpHash,
} from './sms-otp'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'

const testSmsOtpHashSecret = createRuntimeConfig({ NODE_ENV: 'development' }).auth.smsOtp.hashSecret!

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  const sentCodes = new Map<string, string[]>()
  const store = TinychokStore.create(
    database,
    async () => undefined,
    {
      smsOtpSender: async ({ code, phoneE164 }) => {
        const nextCodes = [...(sentCodes.get(phoneE164) ?? []), code]
        sentCodes.set(phoneE164, nextCodes)
        return {
          provider: 'sms_ru' as const,
          providerMessageId: `sms-${nextCodes.length}`,
          providerStatus: 'OK',
          providerStatusCode: 100,
        }
      },
    },
  )

  return {
    sentCodes,
    store,
  }
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function getLastSentCode(sentCodes: Map<string, string[]>, identifier: string) {
  const codes = sentCodes.get(identifier) ?? []
  return codes[codes.length - 1] ?? null
}

function createPendingChallenge(identifier: string, options?: {
  attemptsCount?: number
  code?: string
  expiresAt?: string
  purpose?: 'admin' | 'password_setup' | 'register' | 'reset_password'
}) {
  const code = options?.code ?? '1111'
  const purpose = options?.purpose ?? 'register'

  return {
    attemptsCount: options?.attemptsCount ?? 0,
    clientIp: '93.184.216.34',
    codeHash: buildSmsOtpHash(code, identifier, purpose, testSmsOtpHashSecret),
    codeLength: 4 as const,
    createdAt: '2026-03-28T00:00:00.000Z',
    expiresAt: options?.expiresAt ?? '2099-01-01T00:00:00.000Z',
    id: `otp-${identifier}-${purpose}`,
    lastSentAt: '2026-03-28T00:00:00.000Z',
    phoneE164: identifier,
    provider: 'sms_ru' as const,
    providerStatus: 'OK',
    providerStatusCode: 100,
    purpose,
    resendCount: 0,
    status: 'pending' as const,
    updatedAt: '2026-03-28T00:00:00.000Z',
  }
}

test('generateSmsOtpCode returns fixed-length numeric values with leading zeros', () => {
  assert.equal(generateSmsOtpCode(6, () => 1), '000001')
  assert.equal(generateSmsOtpCode(4, () => 7), '0007')
})

test('buildSmsOtpHash and verifySmsOtpHash validate the code without storing plaintext', () => {
  const hash = buildSmsOtpHash('1234', '+79990000001', 'register', testSmsOtpHashSecret)
  assert.equal(verifySmsOtpHash('1234', '+79990000001', 'register', testSmsOtpHashSecret, hash), true)
  assert.equal(verifySmsOtpHash('6543', '+79990000001', 'register', testSmsOtpHashSecret, hash), false)
})

test('assertPublicClientIp rejects private addresses', () => {
  assert.throws(
    () => assertPublicClientIp('10.0.0.5'),
    (error) => error instanceof HttpError && error.statusCode === 400,
  )
})

test('sms.ru sender retries one temporary provider error and then succeeds', async () => {
  let callCount = 0
  const sender = createSmsRuOtpSender(
    {
      apiId: 'test-api-id',
      baseUrl: 'https://sms.ru',
      template: 'Ваш код: {CODE}',
      testMode: true,
      ttlSeconds: 300,
    },
    {
      fetchImpl: async (_url, init) => {
        callCount += 1
        const body = String(init?.body ?? '')
        assert.match(body, /test=1/u)
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              sms: {
                '+79990000001': {
                  status: 'ERROR',
                  status_code: 500,
                },
              },
              status: 'ERROR',
              status_code: 500,
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          )
        }

        return new Response(
          JSON.stringify({
            sms: {
              '+79990000001': {
                sms_id: 'provider-1',
                status: 'OK',
                status_code: 100,
              },
            },
            status: 'OK',
            status_code: 100,
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        )
      },
      sleep: async () => undefined,
    },
  )

  const result = await sender({
    clientIp: '93.184.216.34',
    code: '1234',
    phoneE164: '+79990000001',
  })

  assert.equal(callCount, 2)
  assert.equal(result.providerStatusCode, 100)
  assert.equal(result.providerMessageId, 'provider-1')
})

test('sms.ru sender maps provider business and antifraud errors into domain HttpErrors', async () => {
  const buildSender = (providerStatusCode: number) =>
    createSmsRuOtpSender(
      {
        apiId: 'test-api-id',
        baseUrl: 'https://sms.ru',
        template: 'Ваш код: {CODE}',
        testMode: false,
        ttlSeconds: 300,
      },
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              sms: {
                '+79990000001': {
                  status: 'ERROR',
                  status_code: providerStatusCode,
                },
              },
              status: 'ERROR',
              status_code: providerStatusCode,
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          ),
        sleep: async () => undefined,
      },
    )

  await assert.rejects(
    () =>
      buildSender(230)({
        clientIp: '93.184.216.34',
        code: '1234',
        phoneE164: '+79990000001',
      }),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )

  await assert.rejects(
    () =>
      buildSender(206)({
        clientIp: '93.184.216.34',
        code: '1234',
        phoneE164: '+79990000001',
      }),
    (error) => error instanceof HttpError && error.statusCode === 503,
  )

  await assert.rejects(
    () =>
      buildSender(507)({
        clientIp: '93.184.216.34',
        code: '1234',
        phoneE164: '+79990000001',
      }),
    (error) => error instanceof HttpError && error.statusCode === 400,
  )
})

test('expired otp challenge is marked as expired and rejected', async () => {
  const { store } = createStore()
  const database = getStoreDatabase(store)
  database.otpChallenges.push(
    createPendingChallenge('+79990000001', {
      expiresAt: '2000-01-01T00:00:00.000Z',
    }),
  )

  await assert.rejects(
    () =>
      store.verifyCode('+79990000001', '1111', {
        accessContext: { ip: '93.184.216.34', userAgent: 'test' },
        entryPoint: 'user',
      }),
    /Код истёк/u,
  )

  assert.equal(database.otpChallenges[0]?.status, 'expired')
})

test('otp challenge blocks after three invalid verification attempts', async () => {
  const { store } = createStore()
  const database = getStoreDatabase(store)
  database.otpChallenges.push(createPendingChallenge('+79990000001'))

  await assert.rejects(
    () => store.verifyCode('+79990000001', '0000', { accessContext: { ip: '93.184.216.34' }, entryPoint: 'user' }),
    /Неверный код/u,
  )
  await assert.rejects(
    () => store.verifyCode('+79990000001', '0000', { accessContext: { ip: '93.184.216.34' }, entryPoint: 'user' }),
    /Неверный код/u,
  )
  await assert.rejects(
    () => store.verifyCode('+79990000001', '0000', { accessContext: { ip: '93.184.216.34' }, entryPoint: 'user' }),
    /Слишком много неверных попыток/u,
  )

  assert.equal(database.otpChallenges[0]?.status, 'blocked')
  assert.equal(database.otpChallenges[0]?.attemptsCount, 3)
})

test('requestCode respects resend cooldown and successful resend cancels the previous pending challenge', async () => {
  const { store } = createStore()
  const database = getStoreDatabase(store)

  await store.requestCode('+79990000001')
  await assert.rejects(
    () => store.requestCode('+79990000001'),
    (error) => error instanceof HttpError && error.statusCode === 429,
  )

  database.authCodeSendAttempts[0]!.createdAt = '2026-03-27T00:00:00.000Z'
  await store.requestCode('+79990000001')

  const pendingChallenges = database.otpChallenges.filter((challenge) => challenge.phoneE164 === '+79990000001')
  assert.equal(pendingChallenges.length, 2)
  assert.equal(pendingChallenges.filter((challenge) => challenge.status === 'pending').length, 1)
  assert.equal(pendingChallenges.filter((challenge) => challenge.status === 'cancelled').length, 1)
})

test('sms otp happy path requests code, verifies it and creates the account session', async () => {
  const { sentCodes, store } = createStore()
  const database = getStoreDatabase(store)

  const requestResponse = await store.requestCode('+79990000001')
  assert.equal(requestResponse.status, 'needs-sms-registration')

  const code = getLastSentCode(sentCodes, '+79990000001')
  assert.ok(code)

  const verifyResponse = await store.verifyCode('+79990000001', code!, {
    accessContext: { ip: '93.184.216.34', userAgent: 'test' },
    entryPoint: 'user',
  })
  assert.equal(verifyResponse.status, 'needs-profile-and-password')
  assert.ok(verifyResponse.continuationToken)

  const snapshot = await store.registerAccount({
    code: '',
    confirmPassword: 'StrongPass123',
    continuationToken: verifyResponse.continuationToken,
    displayName: 'Новый пользователь',
    identifier: '+79990000001',
    password: 'StrongPass123',
  })

  assert.ok(snapshot.session.sessionToken)
  assert.equal(database.accounts.some((account) => account.identifier === '+79990000001'), true)
})
