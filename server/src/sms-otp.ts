import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { HttpError } from './http-error'

export type SmsOtpLength = 4 | 6
export type SmsOtpProvider = 'sms_ru'
export type SmsOtpChallengeStatus =
  | 'pending'
  | 'used'
  | 'expired'
  | 'blocked'
  | 'cancelled'
  | 'send_failed'
export type SmsOtpPurpose =
  | 'admin'
  | 'login'
  | 'password_setup'
  | 'register'
  | 'reset_password'

export type SmsOtpChallengeRecord = {
  attemptsCount: number
  blockedAt?: string
  clientIp: string
  codeHash: string
  codeLength: SmsOtpLength
  continuationExpiresAt?: string
  continuationTokenHash?: string
  createdAt: string
  expiresAt: string
  id: string
  lastSentAt?: string
  phoneE164: string
  provider: SmsOtpProvider
  providerMessageId?: string
  providerStatus?: string
  providerStatusCode?: number
  purpose: SmsOtpPurpose
  resendCount: number
  status: SmsOtpChallengeStatus
  updatedAt: string
  usedAt?: string
  userAgent?: string
}

export type SmsOtpConfig = {
  apiId: string | null
  baseUrl: string
  hashSecret: string | null
  length: SmsOtpLength
  maxSendsPerIpPerDay: number
  maxSendsPerPhonePerDay: number
  maxVerifyAttempts: number
  resendCooldownSeconds: number
  template: string
  testMode: boolean
  ttlSeconds: number
}

export type SmsOtpSendResult = {
  provider: SmsOtpProvider
  providerMessageId?: string
  providerStatus?: string
  providerStatusCode: number
}

export type SmsOtpSender = (input: {
  clientIp: string
  code: string
  phoneE164: string
}) => Promise<SmsOtpSendResult>

type SmsRuEnvelope = {
  sms?: Record<string, SmsRuPhoneStatus | undefined>
  status?: string
  status_code?: number
  status_text?: string
}

type SmsRuPhoneStatus = {
  sms_id?: string
  status?: string
  status_code?: number
  status_text?: string
}

type CreateSmsRuSenderOptions = {
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

const DEFAULT_SMS_MESSAGE_TEMPLATE = 'Ваш код: {CODE}'
const TEMPORARY_SMS_RU_ERROR_CODES = new Set([220, 500])
const RATE_LIMIT_SMS_RU_ERROR_CODES = new Set([230, 231, 232, 233])
const ANTIFRAUD_SMS_RU_ERROR_CODES = new Set([501, 502, 503, 504, 505, 506, 507])

export class SmsOtpProviderError extends HttpError {
  readonly providerStatusCode: number
  readonly providerStatus?: string
  readonly retryable: boolean

  constructor(
    message: string,
    options: {
      providerStatus?: string
      providerStatusCode: number
      retryable?: boolean
      statusCode?: number
    },
  ) {
    super(options.statusCode ?? 503, message)
    this.name = 'SmsOtpProviderError'
    this.providerStatusCode = options.providerStatusCode
    this.providerStatus = options.providerStatus
    this.retryable = Boolean(options.retryable)
  }
}

function isPrivateIpv4Address(value: string) {
  const octets = value.split('.').map((part) => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true
  }

  const [first, second] = octets
  if (first === 10 || first === 127 || first === 0) {
    return true
  }
  if (first === 169 && second === 254) {
    return true
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true
  }
  if (first === 192 && second === 168) {
    return true
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return true
  }
  if (first >= 224) {
    return true
  }

  return false
}

function expandIpv6(value: string) {
  const [head, tail = ''] = value.toLowerCase().split('::')
  const headParts = head ? head.split(':').filter(Boolean) : []
  const tailParts = tail ? tail.split(':').filter(Boolean) : []
  const missing = 8 - (headParts.length + tailParts.length)

  if (missing < 0) {
    return null
  }

  return [...headParts, ...Array.from({ length: missing }, () => '0'), ...tailParts]
}

function isPrivateIpv6Address(value: string) {
  const expanded = expandIpv6(value)
  if (!expanded || expanded.length !== 8) {
    return true
  }

  const firstBlock = Number.parseInt(expanded[0] ?? '0', 16)
  const secondBlock = Number.parseInt(expanded[1] ?? '0', 16)
  if (!Number.isInteger(firstBlock) || !Number.isInteger(secondBlock)) {
    return true
  }

  if (value === '::1') {
    return true
  }
  if ((firstBlock & 0xfe00) === 0xfc00) {
    return true
  }
  if ((firstBlock & 0xffc0) === 0xfe80) {
    return true
  }
  if (firstBlock === 0x2001 && secondBlock === 0x0db8) {
    return true
  }

  return false
}

export function isPublicClientIp(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) {
    return false
  }

  const version = isIP(normalized)
  if (version === 4) {
    return !isPrivateIpv4Address(normalized)
  }
  if (version === 6) {
    return !isPrivateIpv6Address(normalized)
  }

  return false
}

export function assertPublicClientIp(value: string | null | undefined) {
  if (!isPublicClientIp(value)) {
    throw new HttpError(400, 'Не удалось определить публичный IP пользователя для отправки SMS.')
  }

  return value!.trim()
}

export function normalizeSmsPhoneE164(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) {
    return ''
  }

  let normalized = digits
  if (normalized.length === 10) {
    normalized = `7${normalized}`
  } else if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`
  }

  if (!/^7\d{10}$/u.test(normalized)) {
    return ''
  }

  return `+${normalized}`
}

export function maskPhoneE164(value: string) {
  const normalized = normalizeSmsPhoneE164(value)
  if (!normalized) {
    return '***'
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`
}

export function readSmsOtpLength(value: string | undefined, fallback: SmsOtpLength = 6): SmsOtpLength {
  if (value === '4') {
    return 4
  }
  if (value === '6') {
    return 6
  }
  return fallback
}

export function generateSmsOtpCode(length: SmsOtpLength, randomIntImpl = randomInt) {
  const upperBound = 10 ** length
  return String(randomIntImpl(0, upperBound)).padStart(length, '0')
}

function toHashBuffer(value: string) {
  return Buffer.from(value, 'hex')
}

export function buildSmsOtpHash(
  code: string,
  phoneE164: string,
  purpose: SmsOtpPurpose,
  secret: string,
) {
  return createHmac('sha256', secret)
    .update(`${code}${phoneE164}${purpose}`, 'utf8')
    .digest('hex')
}

export function buildOpaqueTokenHash(token: string, secret: string) {
  return createHmac('sha256', secret)
    .update(token, 'utf8')
    .digest('hex')
}

export function verifySmsOtpHash(
  code: string,
  phoneE164: string,
  purpose: SmsOtpPurpose,
  secret: string,
  expectedHash: string,
) {
  const actualBuffer = toHashBuffer(buildSmsOtpHash(code, phoneE164, purpose, secret))
  const expectedBuffer = toHashBuffer(expectedHash)
  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export function verifyOpaqueTokenHash(token: string, secret: string, expectedHash: string) {
  const actualBuffer = toHashBuffer(buildOpaqueTokenHash(token, secret))
  const expectedBuffer = toHashBuffer(expectedHash)
  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export function generateSmsOtpContinuationToken(randomBytesImpl = randomBytes) {
  return randomBytesImpl(24).toString('base64url')
}

export function buildSmsOtpMessage(template: string | null | undefined, code: string) {
  const normalizedTemplate = template?.trim() || DEFAULT_SMS_MESSAGE_TEMPLATE
  if (!/^\d+$/u.test(code) || code.length > 10) {
    throw new Error('OTP код должен состоять только из цифр и быть короче 10 символов.')
  }

  return normalizedTemplate.replaceAll('{CODE}', code)
}

function createSmsRuProviderError(statusCode: number, providerStatus?: string) {
  if (statusCode === 204) {
    return new SmsOtpProviderError('SMS-провайдер отклонил конфигурацию отправки.', {
      providerStatus,
      providerStatusCode: statusCode,
      statusCode: 503,
    })
  }

  if (statusCode === 206) {
    return new SmsOtpProviderError('Дневной лимит отправки SMS у провайдера исчерпан.', {
      providerStatus,
      providerStatusCode: statusCode,
      statusCode: 503,
    })
  }

  if (RATE_LIMIT_SMS_RU_ERROR_CODES.has(statusCode)) {
    return new SmsOtpProviderError('Слишком много запросов SMS-кода. Повторите позже.', {
      providerStatus,
      providerStatusCode: statusCode,
      statusCode: 429,
    })
  }

  if (ANTIFRAUD_SMS_RU_ERROR_CODES.has(statusCode)) {
    return new SmsOtpProviderError('SMS-провайдер отклонил отправку для этого номера или IP.', {
      providerStatus,
      providerStatusCode: statusCode,
      statusCode: statusCode === 507 ? 400 : 429,
    })
  }

  if (TEMPORARY_SMS_RU_ERROR_CODES.has(statusCode)) {
    return new SmsOtpProviderError('SMS-сервис временно недоступен. Попробуйте позже.', {
      providerStatus,
      providerStatusCode: statusCode,
      retryable: true,
      statusCode: 503,
    })
  }

  return new SmsOtpProviderError('Не удалось отправить SMS-код. Попробуйте позже.', {
    providerStatus,
    providerStatusCode: statusCode,
    statusCode: 503,
  })
}

async function parseSmsRuResponse(
  response: Response,
  phoneE164: string,
) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const expectsJson = contentType.includes('application/json')
  const payload = expectsJson ? (await response.json()) as SmsRuEnvelope : undefined

  if (!response.ok) {
    throw new SmsOtpProviderError('SMS-сервис временно недоступен. Попробуйте позже.', {
      providerStatus: response.statusText,
      providerStatusCode: response.status,
      retryable: true,
      statusCode: 503,
    })
  }

  const phonePayload = payload?.sms?.[phoneE164]
  const providerStatusCode = phonePayload?.status_code ?? payload?.status_code ?? 500
  const providerStatus = phonePayload?.status ?? payload?.status ?? payload?.status_text
  if (providerStatusCode !== 100) {
    throw createSmsRuProviderError(providerStatusCode, providerStatus)
  }

  return {
    provider: 'sms_ru' as const,
    providerMessageId: phonePayload?.sms_id,
    providerStatus,
    providerStatusCode,
  }
}

export function createSmsRuOtpSender(
  config: Pick<SmsOtpConfig, 'apiId' | 'baseUrl' | 'template' | 'testMode' | 'ttlSeconds'>,
  options: CreateSmsRuSenderOptions = {},
): SmsOtpSender {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)))

  return async ({ clientIp, code, phoneE164 }) => {
    const apiId = config.apiId?.trim()
    if (!apiId) {
      throw new HttpError(503, 'SMS-авторизация ещё не настроена на сервере.')
    }

    const publicClientIp = assertPublicClientIp(clientIp)
    const message = buildSmsOtpMessage(config.template, code)
    const ttlMinutes = Math.max(1, Math.ceil(config.ttlSeconds / 60))
    const body = new URLSearchParams({
      api_id: apiId,
      ip: publicClientIp,
      json: '1',
      msg: message,
      to: phoneE164,
      ttl: String(ttlMinutes),
    })

    if (config.testMode) {
      body.set('test', '1')
    }

    const send = async () => {
      const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/u, '')}/sms/send`, {
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      })

      return parseSmsRuResponse(response, phoneE164)
    }

    try {
      return await send()
    } catch (error) {
      if (!(error instanceof SmsOtpProviderError) || !error.retryable) {
        throw error
      }

      await sleep(250)
      return await send()
    }
  }
}
