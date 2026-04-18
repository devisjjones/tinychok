import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const productionApiBaseUrl = 'https://api.tinychok.ru'
const productionWsBaseUrl = 'wss://api.tinychok.ru'
const repoRoot = process.cwd()
const distRoot = join(repoRoot, 'dist')
const indexHtmlPath = join(distRoot, 'index.html')
const indexHtml = readFileSync(indexHtmlPath, 'utf8')
const mainChunkMatch = indexHtml.match(/src="(\/assets\/main-[^"]+\.js)"/u)

if (!mainChunkMatch) {
  throw new Error(
    'Production dist verification failed: index.html does not reference a main frontend bundle.',
  )
}

const assetsRoot = join(distRoot, 'assets')
const jsAssetPaths = readdirSync(assetsRoot)
  .filter((entry) => entry.endsWith('.js'))
  .map((entry) => `/assets/${entry}`)

const assetContainingApiBaseUrl = jsAssetPaths.find((assetPath) =>
  readFileSync(join(distRoot, assetPath.replace(/^\//u, '')), 'utf8').includes(productionApiBaseUrl),
)

if (!assetContainingApiBaseUrl) {
  throw new Error(
    `Production dist verification failed: no staged JS asset contains ${productionApiBaseUrl}. ` +
      'Production frontend must not fall back to implicit same-origin /api, because the global release contract expects the dedicated api.tinychok.ru host.',
  )
}

const assetContainingWsBaseUrl = jsAssetPaths.find((assetPath) =>
  readFileSync(join(distRoot, assetPath.replace(/^\//u, '')), 'utf8').includes(productionWsBaseUrl),
)

if (!assetContainingWsBaseUrl) {
  throw new Error(
    `Production dist verification failed: no staged JS asset contains ${productionWsBaseUrl}. ` +
      'Realtime on production must always point to the dedicated api.tinychok.ru websocket host.',
  )
}

console.log(
  `Verified production frontend bootstrap ${mainChunkMatch[1]} with runtime assets ${assetContainingApiBaseUrl} and ${assetContainingWsBaseUrl}.`,
)
