import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

type AppEnvironment = 'development' | 'staging' | 'production'
type StoreMode = 'file' | 'postgres'
type MediaBackend = 'local' | 'object-storage'
type CaptchaProvider = 'disabled' | 'turnstile' | 'smartcaptcha'
type AnalyticsProvider = 'disabled' | 'log' | 'clickhouse'
type PaymentProvider = 'disabled' | 'yookassa'
type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>

import { readSmsOtpLength } from './sms-otp'

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/u, '')
}

function readPort(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  return fallback
}

function readEnvironment(value: string | undefined): AppEnvironment {
  if (value === 'production' || value === 'staging') {
    return value
  }

  return 'development'
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function readStoreMode(value: string | undefined): StoreMode {
  return value === 'postgres' ? 'postgres' : 'file'
}

function readMediaBackend(value: string | undefined): MediaBackend {
  return value === 'object-storage' ? 'object-storage' : 'local'
}

function readCaptchaProvider(value: string | undefined): CaptchaProvider {
  if (value === 'turnstile' || value === 'smartcaptcha') {
    return value
  }

  return 'disabled'
}

function getDefaultCaptchaVerifyUrl(provider: CaptchaProvider) {
  if (provider === 'smartcaptcha') {
    return 'https://smartcaptcha.cloud.yandex.ru/validate'
  }

  return 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
}

function readAnalyticsProvider(value: string | undefined): AnalyticsProvider {
  if (value === 'log' || value === 'clickhouse') {
    return value
  }

  return 'disabled'
}

function readPaymentProvider(value: string | undefined): PaymentProvider {
  return value === 'yookassa' ? 'yookassa' : 'disabled'
}

function readOptionalString(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function readOptionalPositiveInteger(value: string | undefined) {
  if (!value) return null

  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? '', 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function readStringList(value: string | undefined) {
  if (!value) return [] as string[]

  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function toOrigin(value: string | null) {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function readAdminEnabled(value: string | undefined, environment: AppEnvironment) {
  return readBoolean(value, environment !== 'production')
}

function readBuildId(env: RuntimeEnv) {
  const explicitBuildId = env.TINYCHOK_BUILD_ID?.trim()
  if (explicitBuildId) {
    return explicitBuildId
  }

  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return '0.0.0'
  }
}

function assertCaptchaConfiguration(
  environment: AppEnvironment,
  captcha: {
    provider: CaptchaProvider
    secretKey: string | null
    siteKey: string | null
  },
) {
  if (environment === 'development') {
    return
  }

  if (captcha.provider === 'disabled') {
    throw new Error('Captcha должна быть включена в staging и production.')
  }

  if (!captcha.siteKey) {
    throw new Error('Captcha site key обязателен в staging и production.')
  }

  if (!captcha.secretKey) {
    throw new Error('Captcha secret key обязателен в staging и production.')
  }
}

function assertAnalyticsConfiguration(analytics: {
  clickhouse: {
    password: string | null
    url: string | null
    user: string | null
  }
  enabled: boolean
  provider: AnalyticsProvider
}) {
  if (!analytics.enabled || analytics.provider !== 'clickhouse') {
    return
  }

  if (!analytics.clickhouse.url) {
    throw new Error('ClickHouse analytics url обязателен, когда provider=clickhouse.')
  }

  if (!analytics.clickhouse.user) {
    throw new Error('ClickHouse analytics user обязателен, когда provider=clickhouse.')
  }

  if (!analytics.clickhouse.password) {
    throw new Error('ClickHouse analytics password обязателен, когда provider=clickhouse.')
  }
}

function assertPaymentsConfiguration(config: {
  payments: {
    provider: PaymentProvider
    yookassa: {
      publicReturnUrl: string | null
      secretKey: string | null
      shopId: string | null
    }
  }
}) {
  if (config.payments.provider !== 'yookassa') {
    return
  }

  if (!config.payments.yookassa.shopId) {
    throw new Error('YooKassa shop id обязателен, когда provider=yookassa.')
  }

  if (!config.payments.yookassa.secretKey) {
    throw new Error('YooKassa secret key обязателен, когда provider=yookassa.')
  }

  if (!config.payments.yookassa.publicReturnUrl) {
    throw new Error('YooKassa return url обязателен, когда provider=yookassa.')
  }
}

function assertSmsOtpConfiguration(config: {
  auth: {
    smsOtp: {
      apiId: string | null
      hashSecret: string | null
      provider: 'disabled' | 'sms_ru'
      template: string
    }
  }
}) {
  if (config.auth.smsOtp.provider !== 'sms_ru') {
    return
  }

  if (!config.auth.smsOtp.apiId) {
    throw new Error('SMS.ru api id обязателен, когда включена SMS OTP авторизация.')
  }

  if (!config.auth.smsOtp.hashSecret) {
    throw new Error('SMS OTP hash secret обязателен, когда включена SMS OTP авторизация.')
  }

  if (!config.auth.smsOtp.template.includes('{CODE}')) {
    throw new Error('SMS OTP template должен содержать плейсхолдер {CODE}.')
  }
}

export function createRuntimeConfig(env: RuntimeEnv = process.env) {
  const runtimeEnvironment = readEnvironment(env.TINYCHOK_APP_ENV ?? env.NODE_ENV)
  const captchaProvider = readCaptchaProvider(env.TINYCHOK_CAPTCHA_PROVIDER)
  const publicApiBaseUrl = normalizeBaseUrl(env.PUBLIC_API_URL)
  const publicAppBaseUrl = normalizeBaseUrl(env.PUBLIC_APP_URL)
  const publicMediaBaseUrl = normalizeBaseUrl(env.PUBLIC_MEDIA_BASE_URL)
  const publicAdminStagingBaseUrl =
    normalizeBaseUrl(env.PUBLIC_ADMIN_STAGING_URL) ?? 'https://admin.staging.tinychok.ru'
  const publicAdminProductionBaseUrl =
    normalizeBaseUrl(env.PUBLIC_ADMIN_PRODUCTION_URL) ?? 'https://admin.tinychok.ru'
  const extraAllowedOrigins = readStringList(env.TINYCHOK_ALLOWED_ORIGINS)
  const normalizedAllowedOrigins = [
    publicApiBaseUrl,
    publicAppBaseUrl,
    publicAdminStagingBaseUrl,
    publicAdminProductionBaseUrl,
    ...extraAllowedOrigins,
  ]
    .map((value) => toOrigin(value))
    .filter((value): value is string => Boolean(value))

  const captcha = {
    provider: captchaProvider,
    siteKey: readOptionalString(env.TINYCHOK_CAPTCHA_SITE_KEY),
    secretKey: readOptionalString(env.TINYCHOK_CAPTCHA_SECRET_KEY),
    verifyUrl:
      normalizeBaseUrl(env.TINYCHOK_CAPTCHA_VERIFY_URL) ??
      getDefaultCaptchaVerifyUrl(captchaProvider),
  }

  assertCaptchaConfiguration(runtimeEnvironment, captcha)

  const analytics = {
    clickhouse: {
      database: readOptionalString(env.TINYCHOK_ANALYTICS_CLICKHOUSE_DATABASE) ?? 'tinychok_analytics',
      password: readOptionalString(env.TINYCHOK_ANALYTICS_CLICKHOUSE_PASSWORD),
      table: readOptionalString(env.TINYCHOK_ANALYTICS_CLICKHOUSE_TABLE) ?? 'analytics_events',
      timeoutMs: readPositiveInteger(env.TINYCHOK_ANALYTICS_CLICKHOUSE_TIMEOUT_MS, 5000),
      url: normalizeBaseUrl(env.TINYCHOK_ANALYTICS_CLICKHOUSE_URL),
      user: readOptionalString(env.TINYCHOK_ANALYTICS_CLICKHOUSE_USER),
    },
    enabled: readBoolean(env.TINYCHOK_ANALYTICS_ENABLED, false),
    flushIntervalMs: readPort(env.TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS, 5000),
    maxBatchSize: readPort(env.TINYCHOK_ANALYTICS_MAX_BATCH_SIZE, 20),
    metricaCounterId: readOptionalPositiveInteger(env.TINYCHOK_YANDEX_METRICA_COUNTER_ID),
    provider: readAnalyticsProvider(env.TINYCHOK_ANALYTICS_PROVIDER),
  }

  assertAnalyticsConfiguration(analytics)

  const payments = {
    provider: readPaymentProvider(env.TINYCHOK_PAYMENT_PROVIDER),
    yookassa: {
      publicReturnUrl:
        normalizeBaseUrl(env.TINYCHOK_YOOKASSA_RETURN_URL) ?? publicAppBaseUrl,
      receiptTimezone: Number.parseInt(env.TINYCHOK_YOOKASSA_RECEIPT_TIMEZONE?.trim() ?? '3', 10) || 3,
      receiptsEnabled: readBoolean(env.TINYCHOK_YOOKASSA_RECEIPTS_ENABLED, false),
      receiptVatCode: readPositiveInteger(env.TINYCHOK_YOOKASSA_RECEIPT_VAT_CODE, 1),
      secretKey: readOptionalString(env.TINYCHOK_YOOKASSA_SECRET_KEY),
      shopId: readOptionalString(env.TINYCHOK_YOOKASSA_SHOP_ID),
    },
  }

  assertPaymentsConfiguration({ payments })

  const smsOtpApiId = readOptionalString(env.SMS_RU_API_ID)
  const smsOtp = {
    apiId: smsOtpApiId,
    baseUrl: normalizeBaseUrl(env.SMS_RU_BASE_URL) ?? 'https://sms.ru',
    hashSecret:
      readOptionalString(env.SMS_OTP_HASH_SECRET) ??
      (runtimeEnvironment === 'development' ? 'dev-sms-otp-secret' : null),
    length: readSmsOtpLength(env.SMS_OTP_LENGTH, 6),
    maxSendsPerIpPerDay: readPositiveInteger(env.SMS_OTP_MAX_SENDS_PER_IP_PER_DAY, 10),
    maxSendsPerPhonePerDay: readPositiveInteger(env.SMS_OTP_MAX_SENDS_PER_PHONE_PER_DAY, 5),
    maxVerifyAttempts: readPositiveInteger(env.SMS_OTP_MAX_VERIFY_ATTEMPTS, 3),
    provider: smsOtpApiId ? ('sms_ru' as const) : ('disabled' as const),
    resendCooldownSeconds: readPositiveInteger(env.SMS_OTP_RESEND_COOLDOWN_SECONDS, 60),
    template: readOptionalString(env.SMS_OTP_TEMPLATE) ?? 'Ваш код: {CODE}',
    testMode: readBoolean(env.SMS_OTP_TEST_MODE, false),
    ttlSeconds: readPositiveInteger(env.SMS_OTP_TTL_SECONDS, 300),
  }

  assertSmsOtpConfiguration({
    auth: {
      smsOtp,
    },
  })

  return {
    environment: runtimeEnvironment,
    publicUrls: {
      adminProductionBaseUrl: publicAdminProductionBaseUrl,
      adminStagingBaseUrl: publicAdminStagingBaseUrl,
      apiBaseUrl: publicApiBaseUrl,
      appBaseUrl: publicAppBaseUrl,
      mediaBaseUrl: publicMediaBaseUrl,
    },
    allowedOrigins: normalizedAllowedOrigins,
    admin: {
      enabled: readAdminEnabled(env.ADMIN_PANEL_ENABLED, runtimeEnvironment),
      hosts: {
        production: env.ADMIN_PRODUCTION_HOST?.trim() || 'admin.tinychok.ru',
        staging: env.ADMIN_STAGING_HOST?.trim() || 'admin.staging.tinychok.ru',
      },
    },
    release: {
      buildId: readBuildId(env),
    },
    auth: {
      allowedTestPhones: readStringList(env.TINYCHOK_ALLOWED_TEST_PHONES),
      captcha,
      smsOtp,
    },
    analytics,
    payments,
    server: {
      host: env.HOST ?? '127.0.0.1',
      port: readPort(env.PORT, 8787),
      trustProxy: readBoolean(
        env.TINYCHOK_TRUST_PROXY,
        runtimeEnvironment === 'staging' || runtimeEnvironment === 'production',
      ),
    },
    storage: {
      dataFilePath: resolve(process.cwd(), env.STATE_DATA_FILE ?? 'server/data/dev-db.json'),
      localMediaRoot: resolve(process.cwd(), env.LOCAL_MEDIA_ROOT ?? 'server/uploads'),
      mediaBackend: readMediaBackend(env.TINYCHOK_MEDIA_BACKEND),
      mode: readStoreMode(env.TINYCHOK_STORE_MODE),
      retention: {
        cleanupIntervalHours: readPositiveInteger(env.TINYCHOK_RETENTION_CLEANUP_INTERVAL_HOURS, 24),
        historicalDataDays: readPositiveInteger(env.TINYCHOK_RETENTION_DAYS, 365 * 3),
      },
      objectStorage: {
        accessKey: env.OBJECT_STORAGE_ACCESS_KEY?.trim() || null,
        bucket: env.OBJECT_STORAGE_BUCKET?.trim() || null,
        endpoint:
          normalizeBaseUrl(env.OBJECT_STORAGE_ENDPOINT) ?? 'https://storage.yandexcloud.net',
        region: env.OBJECT_STORAGE_REGION?.trim() || 'ru-central1',
        secretKey: env.OBJECT_STORAGE_SECRET_KEY?.trim() || null,
        signedUrlTtlSeconds: readPort(env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS, 300),
      },
      postgres: {
        bootstrapFromFile: readBoolean(env.POSTGRES_BOOTSTRAP_FROM_FILE, true),
        connectionString: env.POSTGRES_URL?.trim() || null,
        database: env.POSTGRES_DB?.trim() || 'tinychok',
        host: env.POSTGRES_HOST?.trim() || '127.0.0.1',
        password: env.POSTGRES_PASSWORD?.trim() || '',
        port: readPort(env.POSTGRES_PORT, 6432),
        ssl: readBoolean(env.POSTGRES_SSL, runtimeEnvironment !== 'development'),
        stateTableName: env.POSTGRES_STATE_TABLE?.trim() || 'app_runtime_state',
        user: env.POSTGRES_USER?.trim() || 'tinychok_app',
      },
    },
  } as const
}

export const runtimeConfig = createRuntimeConfig(process.env)

export function makePublicUrl(pathname: string, preferredBaseUrl?: string | null) {
  if (/^https?:\/\//u.test(pathname)) {
    return pathname
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const baseUrl = preferredBaseUrl ?? runtimeConfig.publicUrls.apiBaseUrl

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath
}
