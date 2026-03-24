import { resolve } from 'node:path'

type AppEnvironment = 'development' | 'staging' | 'production'
type StoreMode = 'file' | 'postgres'
type MediaBackend = 'local' | 'object-storage'
type CaptchaProvider = 'disabled' | 'turnstile'
type AnalyticsProvider = 'disabled' | 'log'

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
  return value === 'turnstile' ? 'turnstile' : 'disabled'
}

function readAnalyticsProvider(value: string | undefined): AnalyticsProvider {
  return value === 'log' ? 'log' : 'disabled'
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

const runtimeEnvironment = readEnvironment(process.env.TINYCHOK_APP_ENV ?? process.env.NODE_ENV)
const publicApiBaseUrl = normalizeBaseUrl(process.env.PUBLIC_API_URL)
const publicAppBaseUrl = normalizeBaseUrl(process.env.PUBLIC_APP_URL)
const publicMediaBaseUrl = normalizeBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL)
const publicAdminStagingBaseUrl =
  normalizeBaseUrl(process.env.PUBLIC_ADMIN_STAGING_URL) ?? 'https://admin.staging.tinychok.ru'
const publicAdminProductionBaseUrl =
  normalizeBaseUrl(process.env.PUBLIC_ADMIN_PRODUCTION_URL) ?? 'https://admin.tinychok.ru'
const extraAllowedOrigins = readStringList(process.env.TINYCHOK_ALLOWED_ORIGINS)
const normalizedAllowedOrigins = [
  publicApiBaseUrl,
  publicAppBaseUrl,
  publicAdminStagingBaseUrl,
  publicAdminProductionBaseUrl,
  ...extraAllowedOrigins,
]
  .map((value) => toOrigin(value))
  .filter((value): value is string => Boolean(value))

export const runtimeConfig = {
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
    enabled: readAdminEnabled(process.env.ADMIN_PANEL_ENABLED, runtimeEnvironment),
    hosts: {
      production: process.env.ADMIN_PRODUCTION_HOST?.trim() || 'admin.tinychok.ru',
      staging: process.env.ADMIN_STAGING_HOST?.trim() || 'admin.staging.tinychok.ru',
    },
  },
  auth: {
    allowedTestPhones: readStringList(process.env.TINYCHOK_ALLOWED_TEST_PHONES),
    captcha: {
      provider: readCaptchaProvider(process.env.TINYCHOK_CAPTCHA_PROVIDER),
      siteKey: process.env.TINYCHOK_CAPTCHA_SITE_KEY?.trim() || null,
      secretKey: process.env.TINYCHOK_CAPTCHA_SECRET_KEY?.trim() || null,
      verifyUrl:
        normalizeBaseUrl(process.env.TINYCHOK_CAPTCHA_VERIFY_URL) ??
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    },
  },
  analytics: {
    enabled: readBoolean(process.env.TINYCHOK_ANALYTICS_ENABLED, false),
    flushIntervalMs: readPort(process.env.TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS, 5000),
    maxBatchSize: readPort(process.env.TINYCHOK_ANALYTICS_MAX_BATCH_SIZE, 20),
    provider: readAnalyticsProvider(process.env.TINYCHOK_ANALYTICS_PROVIDER),
  },
  server: {
    host: process.env.HOST ?? '127.0.0.1',
    port: readPort(process.env.PORT, 8787),
  },
  storage: {
    dataFilePath: resolve(process.cwd(), process.env.STATE_DATA_FILE ?? 'server/data/dev-db.json'),
    localMediaRoot: resolve(process.cwd(), process.env.LOCAL_MEDIA_ROOT ?? 'server/uploads'),
    mediaBackend: readMediaBackend(process.env.TINYCHOK_MEDIA_BACKEND),
    mode: readStoreMode(process.env.TINYCHOK_STORE_MODE),
    objectStorage: {
      accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY?.trim() || null,
      bucket: process.env.OBJECT_STORAGE_BUCKET?.trim() || null,
      endpoint:
        normalizeBaseUrl(process.env.OBJECT_STORAGE_ENDPOINT) ?? 'https://storage.yandexcloud.net',
      region: process.env.OBJECT_STORAGE_REGION?.trim() || 'ru-central1',
      secretKey: process.env.OBJECT_STORAGE_SECRET_KEY?.trim() || null,
      signedUrlTtlSeconds: readPort(process.env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS, 300),
    },
    postgres: {
      bootstrapFromFile: readBoolean(process.env.POSTGRES_BOOTSTRAP_FROM_FILE, true),
      connectionString: process.env.POSTGRES_URL?.trim() || null,
      database: process.env.POSTGRES_DB?.trim() || 'tinychok',
      host: process.env.POSTGRES_HOST?.trim() || '127.0.0.1',
      password: process.env.POSTGRES_PASSWORD?.trim() || '',
      port: readPort(process.env.POSTGRES_PORT, 6432),
      ssl: readBoolean(process.env.POSTGRES_SSL, runtimeEnvironment !== 'development'),
      stateTableName: process.env.POSTGRES_STATE_TABLE?.trim() || 'app_runtime_state',
      user: process.env.POSTGRES_USER?.trim() || 'tinychok_app',
    },
  },
} as const

export function makePublicUrl(pathname: string, preferredBaseUrl?: string | null) {
  if (/^https?:\/\//u.test(pathname)) {
    return pathname
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const baseUrl = preferredBaseUrl ?? runtimeConfig.publicUrls.apiBaseUrl

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath
}
