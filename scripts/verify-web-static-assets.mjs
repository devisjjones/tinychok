const args = process.argv.slice(2)

function readFlag(flag) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function assertContentType(response, expectedFragment, label) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes(expectedFragment)) {
    throw new Error(`${label} must return ${expectedFragment}, got ${contentType || '<missing>'}.`)
  }
}

function extractLinkedHref(html, relPattern) {
  const expression = new RegExp(`<link[^>]+rel="${relPattern}"[^>]+href="([^"]+)"`, 'i')
  return html.match(expression)?.[1] ?? null
}

function findManifestIcon(manifest, size, purpose) {
  return (
    manifest.icons?.find((icon) => {
      if (icon.sizes !== size) return false
      if (purpose && icon.purpose !== purpose) return false
      return typeof icon.src === 'string' && icon.src.length > 0
    }) ?? null
  )
}

async function fetchRequired(url, label, expectedContentType) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${label} request to ${url} failed with status ${response.status}.`)
  }
  if (expectedContentType) {
    assertContentType(response, expectedContentType, label)
  }
  return response
}

const rootUrl = readFlag('--root-url')
if (!rootUrl) {
  throw new Error('Missing required --root-url for static web asset verification.')
}

const normalizedRootUrl = rootUrl.endsWith('/') ? rootUrl.slice(0, -1) : rootUrl
const htmlResponse = await fetchRequired(`${normalizedRootUrl}/`, 'root html', 'text/html')
const html = await htmlResponse.text()

const manifestHref = extractLinkedHref(html, 'manifest')
if (!manifestHref) {
  throw new Error('Root html is missing <link rel="manifest">.')
}

const appleTouchIconHref = extractLinkedHref(html, 'apple-touch-icon')
if (!appleTouchIconHref) {
  throw new Error('Root html is missing <link rel="apple-touch-icon">.')
}

const faviconHref = html.match(/<link[^>]+rel="icon"[^>]+sizes="32x32"[^>]+href="([^"]+)"/i)?.[1] ?? null
if (!faviconHref) {
  throw new Error('Root html is missing the 32x32 PNG favicon link.')
}

const installLink192Href = html.match(/<link[^>]+rel="icon"[^>]+sizes="192x192"[^>]+href="([^"]+)"/i)?.[1] ?? null
if (!installLink192Href) {
  throw new Error('Root html is missing the 192x192 PNG install icon link.')
}

const manifestResponse = await fetchRequired(new URL(manifestHref, `${normalizedRootUrl}/`).toString(), 'manifest', 'application/manifest+json')
const manifest = await manifestResponse.json()

if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  throw new Error('Manifest must include icon entries for installable web-app surfaces.')
}

const installIcon192 = findManifestIcon(manifest, '192x192', 'any')
if (!installIcon192) {
  throw new Error('Manifest must include a square 192x192 install icon with purpose="any".')
}

const installIcon512 = findManifestIcon(manifest, '512x512', 'any')
if (!installIcon512) {
  throw new Error('Manifest must include a square 512x512 install icon with purpose="any".')
}

await fetchRequired(new URL(appleTouchIconHref, `${normalizedRootUrl}/`).toString(), 'apple-touch icon', 'image/png')
await fetchRequired(new URL(faviconHref, `${normalizedRootUrl}/`).toString(), 'favicon 32x32', 'image/png')
await fetchRequired(new URL(installLink192Href, `${normalizedRootUrl}/`).toString(), 'html install icon 192x192', 'image/png')
await fetchRequired(new URL(installIcon192.src, `${normalizedRootUrl}/`).toString(), 'manifest install icon 192x192', 'image/png')
await fetchRequired(new URL(installIcon512.src, `${normalizedRootUrl}/`).toString(), 'manifest install icon 512x512', 'image/png')

console.log(
  JSON.stringify(
    {
      verifiedRootUrl: normalizedRootUrl,
      verifiedManifestUrl: new URL(manifestHref, `${normalizedRootUrl}/`).toString(),
      verifiedAppleTouchIconUrl: new URL(appleTouchIconHref, `${normalizedRootUrl}/`).toString(),
      verifiedFaviconUrl: new URL(faviconHref, `${normalizedRootUrl}/`).toString(),
      verifiedHtmlInstallIcon192Url: new URL(installLink192Href, `${normalizedRootUrl}/`).toString(),
      verifiedInstallIcon192Url: new URL(installIcon192.src, `${normalizedRootUrl}/`).toString(),
      verifiedInstallIcon512Url: new URL(installIcon512.src, `${normalizedRootUrl}/`).toString(),
      manifestIconCount: manifest.icons.length,
    },
    null,
    2,
  ),
)
