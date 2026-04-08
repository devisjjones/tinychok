const args = process.argv.slice(2)

function readFlag(flag) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function hasFlag(flag) {
  return args.includes(flag)
}

const targetUrl = readFlag('--url')
const requireAnalytics = hasFlag('--require-analytics')

if (!targetUrl) {
  throw new Error('Missing required --url for runtime config verification.')
}

const response = await fetch(targetUrl, {
  headers: {
    Accept: 'application/json',
  },
})

if (!response.ok) {
  throw new Error(`Runtime config request failed with status ${response.status}.`)
}

const payload = await response.json()

if (requireAnalytics) {
  const analytics = payload?.analytics

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
}

console.log(
  JSON.stringify(
    {
      analytics: payload.analytics,
      publicUrls: payload.publicUrls,
      verifiedUrl: targetUrl,
    },
    null,
    2,
  ),
)
