import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const stagingApiBaseUrl = 'https://api.staging.tinychok.ru'
const stagingWsBaseUrl = 'wss://api.staging.tinychok.ru'
const repoRoot = process.cwd()
const distRoot = join(repoRoot, 'dist')
const indexHtmlPath = join(distRoot, 'index.html')
const indexHtml = readFileSync(indexHtmlPath, 'utf8')
const mainChunkMatch = indexHtml.match(/src="(\/assets\/main-[^"]+\.js)"/u)

if (!mainChunkMatch) {
  throw new Error(
    'Staging dist verification failed: index.html does not reference a main frontend bundle.',
  )
}

const assetsRoot = join(distRoot, 'assets')
const jsAssetPaths = readdirSync(assetsRoot)
  .filter((entry) => entry.endsWith('.js'))
  .map((entry) => `/assets/${entry}`)

const assetContainingApiBaseUrl = jsAssetPaths.find((assetPath) =>
  readFileSync(join(distRoot, assetPath.replace(/^\//u, '')), 'utf8').includes(stagingApiBaseUrl),
)

if (!assetContainingApiBaseUrl) {
  throw new Error(
    `Staging dist verification failed: no staged JS asset contains ${stagingApiBaseUrl}. ` +
      'This usually means someone built plain production/dev dist for staging, which makes the web app fall back to same-origin /api and re-open nginx basic-auth prompts.',
  )
}

const assetContainingWsBaseUrl = jsAssetPaths.find((assetPath) =>
  readFileSync(join(distRoot, assetPath.replace(/^\//u, '')), 'utf8').includes(stagingWsBaseUrl),
)

if (!assetContainingWsBaseUrl) {
  throw new Error(
    `Staging dist verification failed: no staged JS asset contains ${stagingWsBaseUrl}. ` +
      'Realtime on staging must always point to the dedicated api.staging websocket host.',
  )
}

console.log(
  `Verified staging frontend bootstrap ${mainChunkMatch[1]} with runtime assets ${assetContainingApiBaseUrl} and ${assetContainingWsBaseUrl}.`,
)
