const args = process.argv.slice(2)

function readFlag(flag) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function hasFlag(flag) {
  return args.includes(flag)
}

async function fetchRuntimePayload(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Runtime request to ${targetUrl} failed with status ${response.status}.`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return await response.json()
  }

  const text = (await response.text()).trim()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function assertStatusOk(payload, label) {
  if (typeof payload === 'string') {
    if (!/status\s*:\s*ok/i.test(payload) && payload !== 'ok') {
      throw new Error(`${label} did not report ok status. Got: ${payload}`)
    }
    return
  }

  if (payload?.status !== 'ok') {
    throw new Error(`${label} did not report status=ok.`)
  }
}

const clientConfigUrl = readFlag('--client-config-url')
const healthUrl = readFlag('--health-url')
const readyUrl = readFlag('--ready-url')
const requireAnalytics = hasFlag('--require-analytics')
const expectedMetricaCounterIdRaw = readFlag('--expected-metrica-counter-id')
const expectedMetricaCounterId = expectedMetricaCounterIdRaw ? Number(expectedMetricaCounterIdRaw) : null
const forbiddenMetricaCounterIdRaw = readFlag('--forbid-metrica-counter-id')
const forbiddenMetricaCounterId = forbiddenMetricaCounterIdRaw ? Number(forbiddenMetricaCounterIdRaw) : null
const expectedAnalyticsProvider = readFlag('--expected-analytics-provider') ?? 'log'
const expectedReadyEnvironment = readFlag('--expected-ready-environment')
const expectedAdminEnvironment = readFlag('--expected-admin-environment')
const expectedPublicAppUrl = readFlag('--expected-public-app-url')
const expectedPublicApiUrl = readFlag('--expected-public-api-url')
const expectedCaptchaProvider = readFlag('--expected-captcha-provider')
const requireTrustProxy = hasFlag('--require-trust-proxy')

if (!clientConfigUrl) {
  throw new Error('Missing required --client-config-url for release runtime verification.')
}

if (expectedMetricaCounterIdRaw && !Number.isInteger(expectedMetricaCounterId)) {
  throw new Error('Expected --expected-metrica-counter-id to be an integer.')
}

if (forbiddenMetricaCounterIdRaw && !Number.isInteger(forbiddenMetricaCounterId)) {
  throw new Error('Expected --forbid-metrica-counter-id to be an integer.')
}

if (!['log', 'clickhouse'].includes(expectedAnalyticsProvider)) {
  throw new Error(
    `Expected --expected-analytics-provider to be "log" or "clickhouse", got ${String(expectedAnalyticsProvider)}.`,
  )
}

if (
  expectedReadyEnvironment &&
  !['development', 'staging', 'production'].includes(expectedReadyEnvironment)
) {
  throw new Error(
    `Expected --expected-ready-environment to be development, staging or production, got ${String(expectedReadyEnvironment)}.`,
  )
}

if (
  expectedAdminEnvironment &&
  !['development', 'staging', 'production'].includes(expectedAdminEnvironment)
) {
  throw new Error(
    `Expected --expected-admin-environment to be development, staging or production, got ${String(expectedAdminEnvironment)}.`,
  )
}

if (
  expectedCaptchaProvider &&
  !['disabled', 'turnstile', 'smartcaptcha'].includes(expectedCaptchaProvider)
) {
  throw new Error(
    `Expected --expected-captcha-provider to be disabled, turnstile or smartcaptcha, got ${String(expectedCaptchaProvider)}.`,
  )
}

const healthPayload = healthUrl ? await fetchRuntimePayload(healthUrl) : null
const readyPayload = readyUrl ? await fetchRuntimePayload(readyUrl) : null
const clientConfigPayload = await fetchRuntimePayload(clientConfigUrl)

if (healthPayload) {
  assertStatusOk(healthPayload, 'healthz')
}

if (readyPayload) {
  assertStatusOk(readyPayload, 'readyz')
}

if (expectedReadyEnvironment && readyPayload?.environment !== expectedReadyEnvironment) {
  throw new Error(
    `Runtime readyz environment mismatch. Expected "${expectedReadyEnvironment}", got ${String(readyPayload?.environment)}.`,
  )
}

if (expectedPublicAppUrl && readyPayload?.publicUrls?.appBaseUrl !== expectedPublicAppUrl) {
  throw new Error(
    `Runtime readyz public app url mismatch. Expected "${expectedPublicAppUrl}", got ${String(readyPayload?.publicUrls?.appBaseUrl)}.`,
  )
}

if (expectedPublicApiUrl && readyPayload?.publicUrls?.apiBaseUrl !== expectedPublicApiUrl) {
  throw new Error(
    `Runtime readyz public api url mismatch. Expected "${expectedPublicApiUrl}", got ${String(readyPayload?.publicUrls?.apiBaseUrl)}.`,
  )
}

if (requireTrustProxy && readyPayload?.server?.trustProxy !== true) {
  throw new Error('Runtime readyz server.trustProxy must stay true for staging/production proxy safety.')
}

if (requireAnalytics) {
  const analytics = clientConfigPayload?.analytics

  if (!analytics || analytics.enabled !== true) {
    throw new Error(
      'Runtime config analytics.enabled=false. This usually means the staging/prod env lost explicit analytics keys.',
    )
  }

  if (analytics.provider !== expectedAnalyticsProvider) {
    throw new Error(
      `Runtime config analytics.provider mismatch. Expected "${expectedAnalyticsProvider}", got ${String(analytics.provider)}.`,
    )
  }

  if (!Number.isInteger(analytics.metricaCounterId) || analytics.metricaCounterId <= 0) {
    throw new Error(
      'Runtime config metricaCounterId is missing. Yandex Metrica will not initialize without a positive counter id.',
    )
  }

  if (
    Number.isInteger(expectedMetricaCounterId) &&
    analytics.metricaCounterId !== expectedMetricaCounterId
  ) {
    throw new Error(
      `Runtime config metricaCounterId mismatch. Expected ${expectedMetricaCounterId}, got ${analytics.metricaCounterId}.`,
    )
  }

  if (
    Number.isInteger(forbiddenMetricaCounterId) &&
    analytics.metricaCounterId === forbiddenMetricaCounterId
  ) {
    throw new Error(
      `Runtime config metricaCounterId must not reuse ${forbiddenMetricaCounterId}. Production must not inherit the staging counter id.`,
    )
  }
}

if (expectedAdminEnvironment && clientConfigPayload?.admin?.environment !== expectedAdminEnvironment) {
  throw new Error(
    `Runtime client-config admin.environment mismatch. Expected "${expectedAdminEnvironment}", got ${String(clientConfigPayload?.admin?.environment)}.`,
  )
}

if (expectedCaptchaProvider && clientConfigPayload?.captcha?.provider !== expectedCaptchaProvider) {
  throw new Error(
    `Runtime client-config captcha.provider mismatch. Expected "${expectedCaptchaProvider}", got ${String(clientConfigPayload?.captcha?.provider)}.`,
  )
}

console.log(
  JSON.stringify(
    {
      verifiedClientConfigUrl: clientConfigUrl,
      verifiedHealthUrl: healthUrl,
      verifiedReadyUrl: readyUrl,
      expectedReadyEnvironment,
      expectedAdminEnvironment,
      expectedPublicAppUrl,
      expectedPublicApiUrl,
      expectedCaptchaProvider,
      requireTrustProxy,
      analytics: clientConfigPayload?.analytics ?? null,
      admin: clientConfigPayload?.admin ?? null,
      captcha: clientConfigPayload?.captcha ?? null,
      expectedAnalyticsProvider,
      health: healthPayload,
      ready: readyPayload,
    },
    null,
    2,
  ),
)
