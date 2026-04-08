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

if (!clientConfigUrl) {
  throw new Error('Missing required --client-config-url for release runtime verification.')
}

if (expectedMetricaCounterIdRaw && !Number.isInteger(expectedMetricaCounterId)) {
  throw new Error('Expected --expected-metrica-counter-id to be an integer.')
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

if (requireAnalytics) {
  const analytics = clientConfigPayload?.analytics

  if (!analytics || analytics.enabled !== true) {
    throw new Error(
      'Runtime config analytics.enabled=false. This usually means the staging/prod env lost explicit analytics keys.',
    )
  }

  if (analytics.provider !== 'log') {
    throw new Error(`Runtime config analytics.provider must stay "log", got ${String(analytics.provider)}.`)
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
}

console.log(
  JSON.stringify(
    {
      verifiedClientConfigUrl: clientConfigUrl,
      verifiedHealthUrl: healthUrl,
      verifiedReadyUrl: readyUrl,
      analytics: clientConfigPayload?.analytics ?? null,
      health: healthPayload,
      ready: readyPayload,
    },
    null,
    2,
  ),
)
