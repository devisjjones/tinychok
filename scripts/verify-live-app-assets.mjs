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

function extractRootMainScriptPath(html) {
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/main-[^"]+\.js)"/iu)?.[1] ?? null
}

function extractLazyAssetPaths(mainBundleSource) {
  return Array.from(
    new Set(mainBundleSource.match(/assets\/(?:App|AdminApp)-[^"'`\s)]+\.(?:js|css)/gu) ?? []),
  )
}

const rootUrl = readFlag('--root-url')
if (!rootUrl) {
  throw new Error('Missing required --root-url for live app asset verification.')
}

const normalizedRootUrl = rootUrl.endsWith('/') ? rootUrl.slice(0, -1) : rootUrl
const htmlResponse = await fetchRequired(`${normalizedRootUrl}/`, 'root html', 'text/html')
const html = await htmlResponse.text()
const mainScriptPath = extractRootMainScriptPath(html)

if (!mainScriptPath) {
  throw new Error('Root html is missing the user frontend main-*.js bootstrap script.')
}

const mainScriptUrl = new URL(mainScriptPath, `${normalizedRootUrl}/`).toString()
const mainScriptResponse = await fetchRequired(mainScriptUrl, 'main frontend bundle', 'javascript')
const mainScriptSource = await mainScriptResponse.text()
const lazyAssetPaths = extractLazyAssetPaths(mainScriptSource)

const userAppJsPath = lazyAssetPaths.find((path) => /assets\/App-[^"'`\s)]+\.js$/u.test(path)) ?? null
const userAppCssPath = lazyAssetPaths.find((path) => /assets\/App-[^"'`\s)]+\.css$/u.test(path)) ?? null
const adminAppJsPath = lazyAssetPaths.find((path) => /assets\/AdminApp-[^"'`\s)]+\.js$/u.test(path)) ?? null
const adminAppCssPath = lazyAssetPaths.find((path) => /assets\/AdminApp-[^"'`\s)]+\.css$/u.test(path)) ?? null

if (!userAppJsPath || !userAppCssPath) {
  throw new Error(
    'Unable to resolve live user-app App-*.js/App-*.css from the main frontend bundle. Release proof must inspect the actual lazy-loaded app assets, not guessed filenames.',
  )
}

await fetchRequired(new URL(userAppJsPath, `${normalizedRootUrl}/`).toString(), 'user app js', 'javascript')
await fetchRequired(new URL(userAppCssPath, `${normalizedRootUrl}/`).toString(), 'user app css', 'text/css')

if (adminAppJsPath) {
  await fetchRequired(new URL(adminAppJsPath, `${normalizedRootUrl}/`).toString(), 'admin app js', 'javascript')
}

if (adminAppCssPath) {
  await fetchRequired(new URL(adminAppCssPath, `${normalizedRootUrl}/`).toString(), 'admin app css', 'text/css')
}

console.log(
  JSON.stringify(
    {
      verifiedRootUrl: normalizedRootUrl,
      mainScriptUrl,
      userAppJsUrl: new URL(userAppJsPath, `${normalizedRootUrl}/`).toString(),
      userAppCssUrl: new URL(userAppCssPath, `${normalizedRootUrl}/`).toString(),
      adminAppJsUrl: adminAppJsPath ? new URL(adminAppJsPath, `${normalizedRootUrl}/`).toString() : null,
      adminAppCssUrl: adminAppCssPath ? new URL(adminAppCssPath, `${normalizedRootUrl}/`).toString() : null,
      lazyAssetCount: lazyAssetPaths.length,
    },
    null,
    2,
  ),
)
