import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'
import {
  bottomChannelsActionIcons,
  getBottomChannelsActionIconPath,
  getQuietToggleIconPath,
  quietToggleIcons,
} from '../../src/app/iconContracts'
import {
  premiumArchiveStorageQuotaBytes,
  premiumStorageQuotaBytes,
} from '../../src/shared/constants'
import { normalizeQuietModeSettings, parseMessageTextSegments } from '../../src/shared/utils'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'
import { hashPassword } from './auth-security'

const originalConsoleInfo = console.info

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(
  identifier: string,
  options?: {
    avatarImage?: string
    browserNotificationsEnabled?: boolean
    darkThemeEnabled?: boolean
    invisibilityAutoEnabled?: boolean
    invisibilityEnabled?: boolean
    passwordHash?: string
    premium?: boolean
    premiumExpiresAt?: string
    quietModeSettings?: {
      dialogs?: boolean
      channels?: boolean
      groups?: boolean
      threads?: boolean
      contactRequests?: boolean
      autoInvisibility?: boolean
    }
    quietModeEnabled?: boolean
    soundsDisabled?: boolean
    staffRole?: 'owner' | 'moderator' | 'support'
  },
): Database['accounts'][number] {
  return {
    accountId: `account_${identifier}`,
    avatarImage: options?.avatarImage,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    browserNotificationsEnabled: options?.browserNotificationsEnabled,
    createdAt: '2026-03-28T00:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: `User ${identifier}`,
    darkThemeEnabled: options?.darkThemeEnabled ?? false,
    gifLibrary: [],
    identifier,
    invisibilityAutoEnabled: options?.invisibilityAutoEnabled ?? false,
    invisibilityEnabled: options?.invisibilityEnabled ?? false,
    isTestEntity: false,
    lastActiveAt: '2026-03-28T00:00:00.000Z',
    nickname: '',
    passwordHash: options?.passwordHash,
    passwordSetAt: options?.passwordHash ? '2026-03-28T00:00:00.000Z' : undefined,
    premium: options?.premium ?? false,
    premiumExpiresAt: options?.premiumExpiresAt,
    publicDeleted: undefined,
    quietModeEnabled: options?.quietModeEnabled ?? false,
    quietModeSettings: options?.quietModeSettings
      ? normalizeQuietModeSettings(options.quietModeSettings)
      : undefined,
    soundsDisabled: options?.soundsDisabled ?? false,
    staffRole: options?.staffRole,
    status: '',
    surname: '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-03-28T00:00:00.000Z',
    expiresAt: '2026-04-27T00:00:00.000Z',
    identifier,
    token,
  })
  return token
}

function markSessionLive(store: TinychokStore, token: string) {
  store.markSessionLive(token)
}

function seedAcceptedContactLink(database: Database, leftIdentifier: string, rightIdentifier: string) {
  const [left, right] = [leftIdentifier, rightIdentifier].sort()
  database.contactLinks.push({
    createdAt: '2026-03-28T00:00:00.000Z',
    leftIdentifier: left,
    requesterIdentifier: leftIdentifier,
    rightIdentifier: right,
    status: 'accepted',
    updatedAt: '2026-03-28T00:00:00.000Z',
  })
}

function daysFromNow(days: number) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  return value.toISOString()
}

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      return listSourceFiles(fullPath)
    }
    return /\.(ts|tsx|css)$/.test(entry.name) ? [fullPath] : []
  })
}

test.before(() => {
  console.info = () => undefined
})

test.after(() => {
  console.info = originalConsoleInfo
})

test('browser back navigation stays inside the app before releasing the tab history', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const historySource = readFileSync(
    join(process.cwd(), 'src/app/browserNavigationHistory.ts'),
    'utf8',
  )
  const releaseDoc = readFileSync(join(process.cwd(), 'docs/release-contracts.md'), 'utf8')
  const handoffDoc = readFileSync(join(process.cwd(), 'docs/next-branch-handoff.md'), 'utf8')

  assert.match(historySource, /appNavigationHistoryStateMarker/u)
  assert.match(historySource, /export type AppNavigationRoute/u)
  assert.match(historySource, /export function getAppNavigationRouteEntryKey/u)
  assert.match(historySource, /return `main:\$\{route\.bottomSection\}:\$\{route\.topListView\}:\$\{route\.searchOpen \? 'search' : 'default'\}`/u)
  assert.match(appSource, /window\.addEventListener\('popstate', handlePopState\)/u)
  assert.match(appSource, /window\.history\.replaceState\(/u)
  assert.match(appSource, /window\.history\.pushState\(/u)
  assert.match(appSource, /window\.history\.back\(\)/u)
  assert.match(appSource, /shouldBlockBrowserPopstateNavigation/u)
  assert.match(appSource, /setConfirmProfileSettingsLeaveOpen\(true\)/u)
  assert.match(appSource, /setConfirmChannelSettingsLeaveOpen\(true\)/u)
  assert.match(appSource, /onClick=\{handleThreadRoomBack\}/u)
  assert.ok((appSource.match(/onBack=\{handleRoomBack\}/gu) ?? []).length >= 3)
  assert.match(releaseDoc, /браузерная кнопка `Назад`/u)
  assert.match(handoffDoc, /browser history stack/u)
})

test('attachment storage cleanup copy stays wired into preview and bubble rendering', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const bubbleSource = readFileSync(join(process.cwd(), 'src/components/BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(process.cwd(), 'src/rooms/SubscriptionChannelRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(join(process.cwd(), 'src/components/SelectedBubbleOverlay.tsx'), 'utf8')
  const attachmentPreviewSource = readFileSync(
    join(process.cwd(), 'src/components/ComposerAttachmentPreview.tsx'),
    'utf8',
  )
  const sharedUtilsSource = readFileSync(join(process.cwd(), 'src/shared/utils.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(process.cwd(), 'src/shared/types.ts'), 'utf8')
  const storeSource = readFileSync(join(process.cwd(), 'server/src/store.ts'), 'utf8')
  const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const releaseDoc = readFileSync(join(process.cwd(), 'docs/release-contracts.md'), 'utf8')
  const stagingDoc = readFileSync(join(process.cwd(), 'docs/staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(process.cwd(), 'docs/next-branch-handoff.md'), 'utf8')

  assert.match(appSource, /function getStorageCleanupWarning\(attachmentDraft\?: ComposerAttachmentDraft\)/u)
  assert.match(appSource, /Место закончилось\./u)
  assert.match(appSource, /Ваши прошлые фото и файлы будут скрыты\./u)
  assert.match(appSource, /чтобы избежать удаления файлов\./u)
  assert.match(appSource, /composer-attachment-inline-premium/u)
  assert.match(appSource, /composer-attachment-storage-warning-link/u)
  assert.match(appSource, /Премиум подписку<\/span>/u)
  assert.match(appSource, /composer-attachment-storage-warning-link[\s\S]*openPremiumUpsell\(\)/u)
  assert.match(attachmentPreviewSource, /storageCleanupWarning\?: ReactNode/u)
  assert.match(attachmentPreviewSource, /composer-attachment-storage-warning/u)
  assert.match(bubbleSource, /attachmentRemovedNotice/u)
  assert.match(bubbleSource, /bubble-attachment-removed-note/u)
  assert.match(bubbleSource, /AttachmentRemovedNoticeBlock/u)
  assert.match(bubbleSource, /notice\.reason === 'storage-quota' && notice\.perspective === 'self'/u)
  assert.match(bubbleSource, /bubble-attachment-removed-note-crown/u)
  assert.match(bubbleSource, /onOpenPremiumUpsell\?: \(\) => void/u)
  assert.match(bubbleSource, /bubble-attachment-removed-note-link/u)
  assert.match(
    bubbleSource,
    /bubble-attachment-removed-note-link[\s\S]*onClick=\{\(event\) => \{[\s\S]*onOpenPremiumUpsell\(\)/u,
  )
  assert.match(sharedUtilsSource, /attachmentRemovedNotice/u)
  assert.match(sharedTypesSource, /export type AttachmentRemovedNotice/u)
  assert.match(sharedTypesSource, /perspective\?: 'author' \| 'peer' \| 'self'/u)
  assert.match(storeSource, /buildStorageQuotaAttachmentRemovedNoticeText/u)
  assert.match(storeSource, /return 'Вложение скрыто\.'/u)
  assert.match(storeSource, /return 'Вложение скрыто\. У вас закончилось место\. Оформите подписку\.'/u)
  assert.match(storeSource, /perspective =\s*notice\.perspective === 'author'/u)
  assert.match(storeSource, /reclaimStorageForAttachmentUpload/u)
  assert.match(storeSource, /oldest previously sent attachments first/u)
  assert.match(storeSource, /restoreTargets\?: PersistedArchivedMediaRestoreTarget\[\]/u)
  assert.match(storeSource, /collectArchivedMediaRestoreTargetsForSubject/u)
  assert.match(storeSource, /restoreArchivedMediaIntoPrimaryStorageIfQuotaAllows/u)
  assert.match(storeSource, /entity\.attachmentRemovedNotice = undefined/u)
  assert.match(
    storeSource,
    /message bubble stays in[\s\S]*explanatory notice for both sides/u,
  )
  assert.match(appCss, /\.composer-attachment-storage-warning/u)
  assert.match(appCss, /\.composer-attachment-storage-warning-link/u)
  assert.match(appCss, /background:\s*rgba\(255,\s*251,\s*245,\s*0\.86\)/u)
  assert.match(appCss, /color:\s*rgba\(99,\s*59,\s*40,\s*0\.98\)/u)
  assert.match(appCss, /\.bubble-attachment-removed-note/u)
  assert.match(appCss, /\.bubble-attachment-removed-note-premium/u)
  assert.match(appCss, /\.bubble-attachment-removed-note-link/u)
  assert.match(appCss, /\.bubble-attachment-removed-note-crown img/u)
  assert.match(releaseDoc, /контрастной подчёркнутой inline-cta/u)
  assert.match(stagingDoc, /контрастной подчёркнутой inline-cta/u)
  assert.match(handoffDoc, /контрастная подчёркнутая inline-cta/u)
  assert.ok((directRoomSource.match(/onOpenPremiumUpsell=\{onOpenPremiumUpsell\}/gu) ?? []).length >= 2)
  assert.match(groupRoomSource, /<RoomComposer[\s\S]*onOpenPremiumUpsell=\{onOpenPremiumUpsell\}/u)
  assert.match(
    channelRoomSource,
    /<RoomComposer[\s\S]*onOpenPremiumUpsell=\{publisherOnOpenPremiumUpsell\}/u,
  )
  assert.match(overlaySource, /onOpenPremiumUpsell\?: \(\) => void/u)
  assert.match(overlaySource, /onOpenPremiumUpsell=\{props\.onOpenPremiumUpsell\}/u)
  assert.ok((appSource.match(/onOpenPremiumUpsell=\{openPremiumUpsell\}/gu) ?? []).length >= 10)
})

test('video attachments render through the visual media preview flow and still open in the in-app player', () => {
  const sharedConstantsSource = readFileSync(join(process.cwd(), 'src/shared/constants.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(process.cwd(), 'src/shared/utils.ts'), 'utf8')
  const appUtilsSource = readFileSync(join(process.cwd(), 'src/app/utils.ts'), 'utf8')
  const composerAttachmentsSource = readFileSync(
    join(process.cwd(), 'src/app/composerAttachments.ts'),
    'utf8',
  )
  const pickerSource = readFileSync(
    join(process.cwd(), 'src/components/ComposerAttachmentPicker.tsx'),
    'utf8',
  )
  const attachmentPreviewSource = readFileSync(
    join(process.cwd(), 'src/components/ComposerAttachmentPreview.tsx'),
    'utf8',
  )
  const bubbleSource = readFileSync(
    join(process.cwd(), 'src/components/BubbleMessageContent.tsx'),
    'utf8',
  )
  const mediaViewerSource = readFileSync(
    join(process.cwd(), 'src/components/MediaViewerOverlay.tsx'),
    'utf8',
  )
  const packageJsonSource = readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  const selectedOverlaySource = readFileSync(
    join(process.cwd(), 'src/components/SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const directRoomSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(
    join(process.cwd(), 'src/rooms/SubscriptionChannelRoom.tsx'),
    'utf8',
  )
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const serverMediaSource = readFileSync(join(process.cwd(), 'server/src/media.ts'), 'utf8')
  const serverIndexSource = readFileSync(join(process.cwd(), 'server/src/index.ts'), 'utf8')
  const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')

  assert.match(sharedConstantsSource, /'video\/mp4'/u)
  assert.match(sharedConstantsSource, /'video\/quicktime'/u)
  assert.match(sharedConstantsSource, /'video\/webm'/u)
  assert.match(sharedConstantsSource, /'video\/x-m4v'/u)
  assert.match(sharedConstantsSource, /'\.mp4'/u)
  assert.match(sharedConstantsSource, /'\.mov'/u)
  assert.match(sharedConstantsSource, /'\.webm'/u)
  assert.match(sharedConstantsSource, /'\.m4v'/u)
  assert.match(sharedUtilsSource, /export function isVideoMimeType\(mimeType: string\)/u)
  assert.match(appUtilsSource, /isVideoMimeType,/u)
  assert.match(composerAttachmentsSource, /ATTACHMENT_EXTENSION_MIME_TYPE_MAP/u)
  assert.match(composerAttachmentsSource, /resolveComposerAttachmentMimeType\(fileName: string, mimeType: string \| undefined\)/u)
  assert.match(composerAttachmentsSource, /application\/octet-stream/u)
  assert.match(composerAttachmentsSource, /Поддерживаются PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP и видео MP4, MOV, WEBM, M4V\./u)
  assert.match(pickerSource, /Документы, архивы и видео до 10 МБ/u)
  assert.match(pickerSource, /Документы, архивы и видео до 200 МБ/u)
  assert.match(attachmentPreviewSource, /isVideoMimeType\(attachmentDraft\.mimeType\)/u)
  assert.match(attachmentPreviewSource, /Открыть превью видео/u)
  assert.match(attachmentPreviewSource, /\{videoAttachment \? 'Видео' : 'Файл'\}/u)
  assert.match(bubbleSource, /function buildVideoPreviewUrl\(mediaUrl: string\)/u)
  assert.match(bubbleSource, /function VideoAttachmentPreview\(/u)
  assert.match(bubbleSource, /const isVideoAttachment = Boolean\(/u)
  assert.match(bubbleSource, /const hasVisualAttachment = isImageAttachment \|\| isVideoAttachment/u)
  assert.match(bubbleSource, /isVideoMimeType\(message\.attachment\.mimeType\)/u)
  assert.match(bubbleSource, /const normalizedMediaUrl = mediaUrl\.trim\(\)/u)
  assert.match(bubbleSource, /if \(\/\^\(blob:\|data:\)\/u\.test\(normalizedMediaUrl\)\)/u)
  assert.match(bubbleSource, /new URL\('\/api\/media\/preview', normalizedMediaUrl\)/u)
  assert.match(bubbleSource, /previewUrl\.searchParams\.set\('mediaUrl', normalizedMediaUrl\)/u)
  assert.match(bubbleSource, /new URLSearchParams\(\)/u)
  assert.match(bubbleSource, /return `\/api\/media\/preview\?\$\{previewParams\.toString\(\)\}`/u)
  assert.match(bubbleSource, /const previewUrl = buildVideoPreviewUrl\(mediaUrl\)/u)
  assert.match(bubbleSource, /bubble-attachment-video-preview/u)
  assert.match(bubbleSource, /bubble-attachment-video-fallback/u)
  assert.match(bubbleSource, /bubble-attachment-play-button/u)
  assert.match(bubbleSource, /<img[\s\S]*src=\{previewUrl\}/u)
  assert.match(bubbleSource, /<video[\s\S]*src=\{mediaUrl\}[\s\S]*preload="metadata"/u)
  assert.doesNotMatch(bubbleSource, /function requestVideoPreviewFrame/u)
  assert.doesNotMatch(bubbleSource, /function keepVideoPreviewPaused/u)
  assert.doesNotMatch(bubbleSource, /bubble-attachment-badge-video/u)
  assert.doesNotMatch(bubbleSource, /\{isVideoAttachment \? 'Видео' : 'Файл'\}/u)
  assert.match(mediaViewerSource, /const isVideo = isVideoMimeType\(attachment\.mimeType\)/u)
  assert.match(
    mediaViewerSource,
    /<video[\s\S]*className="media-viewer-video"[\s\S]*controls[\s\S]*playsInline/u,
  )
  assert.match(
    directRoomSource,
    /isImageMimeType\(message\.attachment\.mimeType\)[\s\S]*isVideoMimeType\(message\.attachment\.mimeType\)/u,
  )
  assert.match(
    groupRoomSource,
    /isImageMimeType\(message\.attachment\.mimeType\)[\s\S]*isVideoMimeType\(message\.attachment\.mimeType\)/u,
  )
  assert.match(
    channelRoomSource,
    /isImageMimeType\(post\.attachment\.mimeType\)[\s\S]*isVideoMimeType\(post\.attachment\.mimeType\)/u,
  )
  assert.match(
    selectedOverlaySource,
    /isImageMimeType\(props\.message\.attachment\.mimeType\)[\s\S]*isVideoMimeType\(props\.message\.attachment\.mimeType\)/u,
  )
  assert.match(appSource, /!attachmentDraft \|\|[\s\S]*!isImageMimeType\(attachmentDraft\.mimeType\) && !isVideoMimeType\(attachmentDraft\.mimeType\)/u)
  assert.match(appSource, /Добавьте подпись к видео/u)
  assert.match(appSource, /isVideoMimeType\(threadGroupMessage\.attachment\.mimeType\)/u)
  assert.match(appSource, /isVideoMimeType\(threadChannelPost\.attachment\.mimeType\)/u)
  assert.match(appSource, /isVideoMimeType\(comment\.attachment\.mimeType\)/u)
  assert.match(serverMediaSource, /'video\/mp4': '\.mp4'/u)
  assert.match(serverMediaSource, /'video\/quicktime': '\.mov'/u)
  assert.match(serverMediaSource, /'video\/webm': '\.webm'/u)
  assert.match(serverMediaSource, /'video\/x-m4v': '\.m4v'/u)
  assert.match(serverMediaSource, /const SUPPORTED_VIDEO_ATTACHMENT_EXTENSIONS = new Set\(\['\.mp4', '\.mov', '\.webm', '\.m4v'\]\)/u)
  assert.match(serverMediaSource, /import ffmpegStatic from 'ffmpeg-static'/u)
  assert.match(serverMediaSource, /import \{ createHash, randomUUID \} from 'node:crypto'/u)
  assert.match(serverMediaSource, /export async function generateVideoAttachmentPreview\(mediaUrl: string\)/u)
  assert.match(serverMediaSource, /const VIDEO_ATTACHMENT_PREVIEW_CACHE_DIRECTORY = 'attachment-previews'/u)
  assert.match(serverMediaSource, /createHash\('sha256'\)\.update\(mediaUrl\.trim\(\)\)\.digest\('hex'\)/u)
  assert.match(serverMediaSource, /readStoredMediaByUrl\(mediaUrl, 'attachment'\)/u)
  assert.match(serverMediaSource, /return await readFile\(cachePath\)/u)
  assert.match(serverMediaSource, /execFileAsync\(ffmpegStatic, \[/u)
  assert.match(serverMediaSource, /await mkdir\(dirname\(cachePath\), \{ recursive: true \}\)/u)
  assert.match(serverMediaSource, /await writeFile\(cachePath, previewBuffer\)/u)
  assert.match(serverMediaSource, /mimeType === 'application\/octet-stream'/u)
  assert.match(serverMediaSource, /Поддерживаются PDF, DOC, DOCX, XLS, XLSX, TXT, ZIP и видео MP4, MOV, WEBM, M4V\./u)
  assert.match(serverIndexSource, /const ATTACHMENT_EXTENSION_MIME_TYPE_MAP: Record<string, string> = \{/u)
  assert.match(serverIndexSource, /function resolveAttachmentUploadMimeType\(fileName: string, mimeType: string \| undefined\)/u)
  assert.match(serverIndexSource, /uploadDiagnostic\.mimeType = resolveAttachmentUploadMimeType\(file\.filename, file\.mimetype\)/u)
  assert.match(serverIndexSource, /app\.get\('\/api\/media\/preview'/u)
  assert.match(serverIndexSource, /const previewBuffer = await generateVideoAttachmentPreview\(mediaUrl\)/u)
  assert.match(packageJsonSource, /"ffmpeg-static":/u)
  assert.match(appCss, /\.bubble-attachment-video-preview/u)
  assert.match(appCss, /\.bubble-attachment-play-button/u)
  assert.match(appCss, /\.bubble-attachment-play-icon/u)
  assert.doesNotMatch(appCss, /\.bubble-attachment-badge-video/u)
  assert.match(appCss, /\.composer-attachment-preview-file-badge\.video/u)
  assert.match(appCss, /\.media-viewer-video/u)
})

test('composer attachment rename flow keeps extension outside the input and sends the overridden filename to the server', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sharedConstantsSource = readFileSync(join(repoRoot, 'src', 'shared', 'constants.ts'), 'utf8')
  const composerAttachmentsSource = readFileSync(join(repoRoot, 'src', 'app', 'composerAttachments.ts'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const attachmentPreviewSource = readFileSync(
    join(repoRoot, 'src', 'components', 'ComposerAttachmentPreview.tsx'),
    'utf8',
  )
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const roomComposerSource = readFileSync(join(repoRoot, 'src', 'components', 'RoomComposer.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(sharedConstantsSource, /export const composerAttachmentRenameMaxLength = 50/u)
  assert.match(composerAttachmentsSource, /export function getComposerAttachmentFileNameParts/u)
  assert.match(composerAttachmentsSource, /export function setComposerAttachmentFileBaseName/u)
  assert.match(composerAttachmentsSource, /buildComposerAttachmentFileName/u)
  assert.match(composerAttachmentsSource, /attachmentDraft\.fileName\)\.baseName/u)
  assert.match(backendSource, /uploadFileName\?: string/u)
  assert.match(backendSource, /formData\.append\('file', file, uploadFileName \|\| file\.name\)/u)
  assert.match(
    appSource,
    /uploadMediaFile\(\s*sessionToken,\s*attachmentDraft\.file,\s*'attachment',\s*attachmentDraft\.fileName,\s*(?:\{\s*onProgress:\s*options\?\.onProgress\s*\}|\))/u,
  )
  assert.match(appSource, /function renameChatAttachmentFileBaseName/u)
  assert.match(appSource, /function renameGroupAttachmentFileBaseName/u)
  assert.match(appSource, /function renameChannelAttachmentFileBaseName/u)
  assert.match(appSource, /function renameThreadAttachmentFileBaseName/u)
  assert.match(appSource, /function renameSupportAttachmentFileBaseName/u)
  assert.match(attachmentPreviewSource, /onRenameFileBaseName\?: \(nextBaseName: string\) => void/u)
  assert.match(attachmentPreviewSource, /composer-attachment-preview-title-inline/u)
  assert.match(attachmentPreviewSource, /aria-label="Изменить название файла"/u)
  assert.match(attachmentPreviewSource, /\/icons\/edit100\.png/u)
  assert.match(attachmentPreviewSource, /composer-attachment-rename-backdrop/u)
  assert.match(attachmentPreviewSource, /Текущее название/u)
  assert.match(attachmentPreviewSource, /Новое название/u)
  assert.match(attachmentPreviewSource, /composer-attachment-rename-popover/u)
  assert.match(attachmentPreviewSource, /composer-attachment-rename-input/u)
  assert.match(attachmentPreviewSource, /composer-attachment-rename-extension/u)
  assert.match(attachmentPreviewSource, /maxLength=\{composerAttachmentRenameMaxLength\}/u)
  assert.match(directRoomSource, /onRenameAttachmentFileBaseName=\{onRenameAttachmentFileBaseName\}/u)
  assert.match(roomComposerSource, /onRenameFileBaseName=\{onRenameAttachmentFileBaseName\}/u)
  assert.match(groupRoomSource, /onRenameAttachmentFileBaseName=\{onRenameAttachmentFileBaseName\}/u)
  assert.match(
    channelRoomSource,
    /onRenameAttachmentFileBaseName=\{publisherOnRenameAttachmentFileBaseName\}/u,
  )
  assert.match(appCss, /\.composer-attachment-rename-trigger/u)
  assert.match(appCss, /\.composer-attachment-preview-title-inline/u)
  assert.match(appCss, /\.composer-attachment-rename-trigger img/u)
  assert.match(appCss, /\.composer-attachment-rename-backdrop/u)
  assert.match(appCss, /\.composer-attachment-rename-popover/u)
  assert.match(appCss, /position:\s*fixed/u)
  assert.match(appCss, /\.composer-attachment-rename-input-row/u)
  assert.match(appCss, /\.composer-attachment-rename-extension/u)
})

test('group history visibility for newly joined members stays wired through types, settings UI, and join-time backfill', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const groupSettingsFlowSource = readFileSync(
    join(repoRoot, 'src', 'app', 'useGroupSettingsFlow.ts'),
    'utf8',
  )
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(sharedTypesSource, /showHistoryToNewMembers\?: boolean/u)
  assert.match(sharedBackendSource, /showHistoryToNewMembers\?: boolean/u)
  assert.match(groupSettingsFlowSource, /showHistoryToNewMembers: group\.showHistoryToNewMembers !== false/u)
  assert.match(
    groupSettingsFlowSource,
    /Boolean\(groupSettingsDraft\.showHistoryToNewMembers !== false\) !==[\s\S]*Boolean\(activeGroup\.showHistoryToNewMembers !== false\)/u,
  )
  assert.match(appSource, /Отображать историю группы новым пользователям/u)
  assert.match(appSource, /showHistoryToNewMembers: true/u)
  assert.match(storeSource, /showHistoryToNewMembers: payload\.showHistoryToNewMembers !== false/u)
  assert.match(storeSource, /groupCopy\.showHistoryToNewMembers = Boolean\(payload\.showHistoryToNewMembers\)/u)
  assert.match(storeSource, /seedGroupHistoryForOwnerCopy/u)
  assert.match(storeSource, /Можно начинать обсуждение\./u)
})

test('admin list filter tabs render the "all" counter with the same pill badge as archived and active filters', () => {
  const adminAppSource = readFileSync(join(process.cwd(), 'src/AdminApp.tsx'), 'utf8')
  const adminCss = readFileSync(join(process.cwd(), 'src/admin.css'), 'utf8')

  assert.match(
    adminAppSource,
    /className=\{userListFilter === 'all' \? 'admin-filter-tab active' : 'admin-filter-tab'\}[\s\S]*<span>Все<\/span>[\s\S]*<span className="admin-filter-count">\{totalUserCount\}<\/span>/u,
  )
  assert.match(
    adminAppSource,
    /className=\{channelListFilter === 'all' \? 'admin-filter-tab active' : 'admin-filter-tab'\}[\s\S]*<span>Все<\/span>[\s\S]*<span className="admin-filter-count">\{channels\.length\}<\/span>/u,
  )
  assert.match(
    adminAppSource,
    /className=\{groupListFilter === 'all' \? 'admin-filter-tab active' : 'admin-filter-tab'\}[\s\S]*<span>Все<\/span>[\s\S]*<span className="admin-filter-count">\{groups\.length\}<\/span>/u,
  )
  assert.match(
    adminAppSource,
    /className=\{threadListFilter === 'all' \? 'admin-filter-tab active' : 'admin-filter-tab'\}[\s\S]*<span>Все<\/span>[\s\S]*<span className="admin-filter-count">\{threads\.length\}<\/span>/u,
  )
  assert.doesNotMatch(adminAppSource, />Все\s*\([^<]+\)</u)
  assert.match(adminCss, /\.admin-filter-count\s*\{/u)
  assert.match(adminCss, /\.admin-filter-tab\.active \.admin-filter-count\s*\{/u)
})

test('thread inbox keeps participants subscribed and protects unread counts from same-millisecond replies', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(storeSource, /const isRootAuthor =[\s\S]*resolveGroupMessageAuthorIdentifier\(group, message\)/u)
  assert.match(storeSource, /const latestOwnComment = findLatestOwnThreadComment\(comments, ownerIdentifier\)/u)
  assert.match(storeSource, /const lastReadCommentId =[\s\S]*latestOwnComment\?\.id/u)
  assert.match(storeSource, /const isRootAuthor =[\s\S]*resolveSubscriptionPostAuthorIdentifier\(database, channel, post\)/u)
  assert.match(storeSource, /const latestOwnComment = findLatestOwnThreadComment\(comments, ownerIdentifier\)[\s\S]*post\.createdAt/u)
  assert.match(storeSource, /comments\.length > 0 &&[\s\S]*hasParticipation &&[\s\S]*threadState\?\.subscription !== 'unsubscribed'/u)
  assert.match(storeSource, /function buildThreadReadMarker\(/u)
  assert.match(storeSource, /lastReadCommentId:\s*latestComment\?\.id \?\? \(latestComment\?\.createdAt \|\| fallbackCreatedAt \? 0 : undefined\)/u)
  assert.match(storeSource, /if \(createdAt === lastReadAt\) \{[\s\S]*if \(lastReadCommentId === undefined\) return count[\s\S]*if \(\(comment\.id \?\? 0\) <= lastReadCommentId\) return count/u)
  assert.match(storeSource, /lastReadCommentId: nextState\.lastReadCommentId/u)
  assert.match(
    storeSource,
    /const latestComment = findLatestThreadComment\(compactThreadComments\(target\.message\.threadComments\)\)[\s\S]*buildThreadReadMarker\(latestComment, target\.message\.createdAt\)/u,
  )
  assert.match(
    storeSource,
    /const latestComment = findLatestThreadComment\(compactThreadComments\(target\.post\.threadComments\)\)[\s\S]*buildThreadReadMarker\(latestComment, target\.post\.createdAt\)/u,
  )
  assert.match(storeSource, /for \(const ticket of this\.database\.supportTickets\) \{[\s\S]*retainedThreadIds\.add\(ticket\.threadId\)/u)
  assert.match(
    storeSource,
    /const nextThreadStates = this\.database\.threadStates\.filter\(\(state\) => retainedThreadIds\.has\(state\.threadId\)\)[\s\S]*didMutate = true/u,
  )
})

test('thread inbox cards keep source badges on the avatar and render latest-comment previews with mini author avatars', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')

  assert.match(sharedTypesSource, /export type GroupThreadInboxItem = \{[\s\S]*avatarImage\?: string/u)
  assert.match(sharedTypesSource, /export type ChannelThreadInboxItem = \{[\s\S]*avatarImage\?: string/u)
  assert.match(sharedUtilsSource, /export function formatMessageTimeLabel/u)
  assert.match(sharedTypesSource, /latestCommentAuthorAccent\?: string/u)
  assert.match(sharedTypesSource, /latestCommentAuthorAvatarImage\?: string/u)
  assert.match(storeSource, /avatarImage: group\.avatarImage,[\s\S]*groupAccent: group\.accent/u)
  assert.match(storeSource, /latestCommentAuthorAccent: latestCommentGroupParticipant\?\.accent \?\? '#cfb4a0'/u)
  assert.match(storeSource, /latestCommentAuthorAvatarImage:[\s\S]*latestCommentAuthorAccount\?\.avatarImage \?\? latestCommentGroupParticipant\?\.avatarImage/u)
  assert.match(storeSource, /avatarImage: channel\.avatarImage,[\s\S]*channelAccent: channel\.accent/u)
  assert.match(storeSource, /latestCommentAuthorAccent: '#cfb4a0'/u)
  assert.match(storeSource, /latestCommentAuthorAvatarImage: latestCommentAuthorAccount\?\.avatarImage/u)
  assert.match(appSource, /const formatThreadInboxTitle = \(item: ThreadInboxItem\) =>/u)
  assert.match(appSource, /const formatThreadInboxActivityLabel = \(item: ThreadInboxItem\) =>/u)
  assert.match(appSource, /const resolveThreadInboxAvatarImage = \(item: ThreadInboxItem\) =>/u)
  assert.match(appSource, /const formatThreadInboxPreviewText = \(item: ThreadInboxItem\) =>/u)
  assert.match(appSource, /const resolveThreadInboxPreviewAuthor = \(item: ThreadInboxItem\) =>/u)
  assert.match(appSource, /formatMessageTimeLabel\(\s*threadGroupMessage\?\.createdAt/u)
  assert.match(appSource, /formatMessageTimeLabel\(\s*threadChannelPost\?\.createdAt/u)
  assert.match(appSource, /const threadCommentTime = formatMessageTimeLabel\(comment\.createdAt, comment\.time\)/u)
  assert.match(
    appSource,
    /<BubbleTextInlineMeta\s+edited=\{Boolean\(comment\.editedAt\)\}\s+time=\{threadCommentTime\}\s*\/>/u,
  )
  assert.match(appSource, /<time>\{threadCommentTime\}<\/time>/u)
  assert.match(appSource, /aria-label="Комментарии"/u)
  assert.match(appSource, /title="Комментарии"/u)
  assert.match(appSource, /Комментариев пока нет/u)
  assert.match(appSource, /Подписка на комментарии/u)
  assert.match(appSource, /<strong className="chat-name-text">\{formatThreadInboxTitle\(item\)\}<\/strong>/u)
  assert.match(appSource, /<span className="chat-handle thread-inbox-activity">\{formatThreadInboxActivityLabel\(item\)\}<\/span>/u)
  assert.match(appSource, /const threadInboxAvatarImage = resolveThreadInboxAvatarImage\(item\)/u)
  assert.match(appSource, /const threadInboxPreviewAuthor = resolveThreadInboxPreviewAuthor\(item\)/u)
  assert.match(appSource, /const threadInboxPreviewText = formatThreadInboxPreviewText\(item\)/u)
  assert.match(appSource, /className="chat-avatar-stack thread-inbox-avatar-stack"/u)
  assert.match(appSource, /className="thread-inbox-source-badge"/u)
  assert.match(appSource, /threadInboxAvatarImage \? \(\s*<img src=\{threadInboxAvatarImage\} alt="" className="channel-avatar-image" \/>\s*\)/u)
  assert.match(appSource, /className="chat-preview thread-preview-row"/u)
  assert.match(appSource, /className="avatar thread-preview-author-avatar"/u)
  assert.match(appSource, /className="thread-preview-author-separator">:<\/span>/u)
  assert.match(appSource, /<span className="thread-preview-text">\{threadInboxPreviewText\}<\/span>/u)
  assert.doesNotMatch(appSource, /Группа: \$\{item\.groupTitle\}/u)
  assert.doesNotMatch(appSource, /Канал: \$\{item\.channelTitle\}/u)
  assert.match(appCss, /\.chat-card\.thread-inbox-card\s*\{[\s\S]*align-items:\s*start;/u)
  assert.match(appCss, /\.chat-card\.thread-inbox-card \.thread-inbox-avatar\s*\{[\s\S]*width:\s*48px;[\s\S]*height:\s*48px;/u)
  assert.match(appCss, /\.thread-inbox-source-badge\s*\{[\s\S]*bottom:\s*-2px;[\s\S]*box-shadow:\s*0 0 0 2px rgba\(255, 251, 245, 0\.96\);/u)
  assert.match(appCss, /\.thread-preview-row\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/u)
  assert.match(appCss, /\.thread-preview-author-avatar\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/u)
})

test('open thread read sync clears visible unread for an open thread and re-runs if the server returns stale unread again', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /const activeThreadReadSyncKeyRef = useRef<string \| null>\(null\)/u)
  assert.match(appSource, /const activeThreadLatestActivityAt =/u)
  assert.match(
    appSource,
    /const activeThreadServerUnreadCount =[\s\S]*activeThreadInboxItem\?\.unreadCount[\s\S]*threadTarget\?\.kind === 'support' \? activeSupportTicket\?\.unreadCount \?\? 0 : 0/u,
  )
  assert.match(appSource, /const activeVisibleThreadId =[\s\S]*threadTarget && documentVisible && activeThreadId \? activeThreadId : null/u)
  assert.match(appSource, /const visibleThreadInbox = activeVisibleThreadId[\s\S]*item\.threadId === activeVisibleThreadId[\s\S]*unreadCount: 0/u)
  assert.match(appSource, /threadGroupMessage\?\.threadComments\?\.at\(-1\)\?\.createdAt \?\? threadGroupMessage\?\.createdAt/u)
  assert.match(appSource, /threadChannelPost\?\.threadComments\?\.at\(-1\)\?\.createdAt \?\? threadChannelPost\?\.createdAt/u)
  assert.match(appSource, /const orderedThreadInbox = \[\.\.\.visibleThreadInbox\]\.sort/u)
  assert.match(appSource, /if \(!sortByUnreadEnabled \|\| activeVisibleThreadId\)/u)
  assert.match(appSource, /const totalThreadNotifications = visibleThreadInbox\.reduce/u)
  assert.match(
    appSource,
    /if \(!threadTarget \|\| !activeThreadId \|\| !documentVisible \|\| activeThreadServerUnreadCount <= 0\)/u,
  )
  assert.match(
    appSource,
    /const syncKey = `\$\{activeThreadId\}:\$\{activeThreadLatestActivityAt \?\? ''\}:\$\{activeThreadServerUnreadCount\}`/u,
  )
  assert.match(appSource, /if \(activeThreadReadSyncKeyRef\.current === syncKey\) return/u)
  assert.match(appSource, /activeThreadReadSyncKeyRef\.current = syncKey/u)
  assert.match(
    appSource,
    /activeThreadLatestActivityAt,\s*activeThreadServerUnreadCount,\s*documentVisible,\s*syncActiveThreadRead,\s*threadTarget/u,
  )
  assert.match(
    appSource,
    /if \(threadTarget && activeThreadId && documentVisible && activeThreadServerUnreadCount > 0\) return[\s\S]*activeThreadReadSyncKeyRef\.current = null/u,
  )
})

test('parseMessageTextSegments linkifies only explicit http/https urls and keeps trailing punctuation outside the href', () => {
  assert.deepEqual(parseMessageTextSegments('https://example.com'), [
    {
      href: 'https://example.com',
      kind: 'external-link',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'https://example.com',
    },
  ])

  assert.deepEqual(parseMessageTextSegments('Смотри https://example.com/path).'), [
    {
      kind: 'text',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'Смотри ',
    },
    {
      href: 'https://example.com/path',
      kind: 'external-link',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'https://example.com/path',
    },
    {
      kind: 'text',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: ').',
    },
  ])

  assert.deepEqual(parseMessageTextSegments('www.example.com'), [
    {
      kind: 'text',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'www.example.com',
    },
  ])

  assert.deepEqual(parseMessageTextSegments('example.com'), [
    {
      kind: 'text',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'example.com',
    },
  ])

  assert.deepEqual(parseMessageTextSegments('@mira https://example.com'), [
    {
      kind: 'text',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: '@mira ',
    },
    {
      href: 'https://example.com',
      kind: 'external-link',
      style: { bold: false, italic: false, strike: false, underline: false },
      value: 'https://example.com',
    },
  ])
})

test('external links in message text stay gated behind app-level warning modal', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const selectedOverlaySource = readFileSync(join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.match(bubbleSource, /parseMessageTextSegments/u)
  assert.match(bubbleSource, /className="bubble-text-link"/u)
  assert.match(bubbleSource, /onOpenExternalLink\?\.\(segment\.href\)/u)
  assert.match(bubbleSource, /event\.stopPropagation\(\)/u)
  assert.match(appSource, /pendingExternalLinkUrl/u)
  assert.match(appSource, /Вы переходите во внешний источник под свою ответственность/u)
  assert.match(appSource, /Не переходите по ссылкам от малоизвестных аккаунтов/u)
  assert.match(appSource, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/u)
  assert.match(directRoomSource, /onOpenExternalLink=\{onOpenExternalLink\}/u)
  assert.match(groupRoomSource, /onOpenExternalLink=\{onOpenExternalLink\}/u)
  assert.match(channelRoomSource, /onOpenExternalLink=\{onOpenExternalLink\}/u)
  assert.match(selectedOverlaySource, /onOpenExternalLink=\{props\.onOpenExternalLink\}/u)
  assert.match(appCss, /\.bubble-text-link/u)
  assert.match(appCss, /\.external-link-warning-dialog/u)
  assert.match(appCss, /\.external-link-warning-title/u)
  assert.match(appCss, /\.external-link-warning-url/u)
  assert.match(handoffDoc, /raw `http:\/\/` и `https:\/\/` в текстах сообщений и комментариев считаются отдельным linkify-контрактом/u)
  assert.match(handoffDoc, /bare domains без протокола \(`example\.com`, `www\.example\.com`\) намеренно не linkify/u)
  assert.match(handoffDoc, /modal советует не переходить по ссылкам от малоизвестных аккаунтов/u)
  assert.match(rolloutDoc, /raw `http:\/\/` и `https:\/\/` в текстах сообщений\/комментариев отображаются ссылками/u)
  assert.match(rolloutDoc, /tap по ссылке открывает warning-modal, а не message-actions menu/u)
  assert.match(releaseDoc, /явные `http:\/\/` и `https:\/\/` в тексте сообщений и комментариев считаются linkify-контрактом/u)
  assert.match(releaseDoc, /bare domains без протокола \(`example\.com`, `www\.example\.com`\) не linkify/u)
})

test('search surface owns its own top filters and can hide contacts or channels independently', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const browserHistorySource = readFileSync(
    join(repoRoot, 'src', 'app', 'browserNavigationHistory.ts'),
    'utf8',
  )

  assert.match(browserHistorySource, /export type SearchTopFilter = 'all' \| 'contacts' \| 'channels'/u)
  assert.match(appSource, /type SearchTopFilter,/u)
  assert.match(appSource, /const \[searchTopFilter, setSearchTopFilter\] = useState<SearchTopFilter>\('all'\)/u)
  assert.match(appSource, /searchOpen\s*\?\s*'filters search-filters'/u)
  assert.match(appSource, /aria-label=\{\s*searchOpen\s*\?\s*'Фильтры поиска'/u)
  assert.match(appSource, /setSearchTopFilter\('all'\)/u)
  assert.match(appSource, /setSearchTopFilter\('contacts'\)/u)
  assert.match(appSource, /setSearchTopFilter\('channels'\)/u)
  assert.match(appSource, /src="\/icons\/contacts100\.svg"/u)
  assert.match(appSource, /src="\/icons\/news100\.svg"/u)
  assert.match(appSource, /const searchShowsContacts = searchTopFilter !== 'channels'/u)
  assert.match(appSource, /const searchShowsChannels = searchTopFilter !== 'contacts'/u)
  assert.match(appSource, /\{searchShowsContacts && myContactsResults\.length > 0 \? \(/u)
  assert.match(appSource, /\{searchShowsChannels && channelSearchResults\.length > 0 \? \(/u)
  assert.match(appSource, /\{searchShowsContacts \? \(/u)
  assert.match(appSource, /!hasVisibleSearchResults/u)
  assert.match(appCss, /\.search-filters/u)
})

test('left rail lists use a shared today-vs-date formatter for activity labels', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const sharedUtilsSource = readFileSync(join(process.cwd(), 'src/shared/utils.ts'), 'utf8')

  assert.match(sharedUtilsSource, /export function formatSidebarActivityLabel/u)
  assert.match(sharedUtilsSource, /month: 'short'/u)
  assert.match(appSource, /formatSidebarActivityLabel\(chat\.messages\.at\(-1\)\?\.createdAt, chat\.messages\.at\(-1\)\?\.time \?\? ''\)/u)
  assert.match(appSource, /formatSidebarActivityLabel\(item\.latestActivityAt, item\.latestCommentTime\)/u)
  assert.doesNotMatch(appSource, /chat-topline-meta">\{chat\.messages\.at\(-1\)\?\.time\}/u)
  assert.doesNotMatch(appSource, /chat-topline-meta">\{item\.latestCommentTime\}/u)
})

test('group and channel left-rail cards share avatar layout and group previews use author avatars', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const handoffDoc = readFileSync(join(process.cwd(), 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(process.cwd(), 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(process.cwd(), 'docs', 'release-contracts.md'), 'utf8')

  assert.match(appSource, /'chat-card group-list-card active'/u)
  assert.match(appSource, /'chat-card group-list-card'/u)
  assert.match(appSource, /'chat-card dialog-list-card active'/u)
  assert.match(appSource, /'chat-card dialog-list-card'/u)
  assert.match(appSource, /'chat-card',\s*[\r\n]+\s*'chat-card-compact',\s*[\r\n]+\s*'dialog-list-card'/u)
  assert.match(appSource, /const groupPreviewAuthor = resolveGroupPreviewAuthor\(group, session\)/u)
  assert.match(appSource, /className="chat-preview group-preview-row"/u)
  assert.match(appSource, /className="avatar group-preview-author-avatar"/u)
  assert.doesNotMatch(appSource, /formatGroupLatestAuthor\(group\)/u)
  assert.match(appCss, /\.chat-card\.dialog-list-card \.chat-avatar-stack\s*\{[\s\S]*align-self:\s*center;/u)
  assert.match(
    appCss,
    /\.chat-card\.dialog-list-card\s*\{[\s\S]*align-items:\s*center;[\s\S]*padding:\s*8px 12px 7px 10px;[\s\S]*gap:\s*9px;[\s\S]*border-radius:\s*18px;/u,
  )
  assert.match(appCss, /\.chat-card\.dialog-list-card \.avatar\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;[\s\S]*border-radius:\s*20px;/u)
  assert.match(appCss, /\.chat-card\.channel-list-card,\s*[\r\n]+\s*\.chat-card\.group-list-card\s*\{[\s\S]*padding:\s*9px 14px 9px 10px;[\s\S]*gap:\s*12px;/u)
  assert.match(appCss, /\.chat-card\.channel-list-card \.avatar,\s*[\r\n]+\s*\.chat-card\.group-list-card \.avatar\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/u)
  assert.match(appCss, /\.chat-card\.group-list-card \.chat-copy\s*\{[\s\S]*gap:\s*2px;/u)
  assert.match(appCss, /\.chat-card\.group-list-card \.group-preview-row\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/u)
  assert.match(appCss, /\.chat-card\.group-list-card \.group-preview-author-avatar\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/u)
  assert.match(appCss, /\.chat-card\.group-list-card \.chat-handle,\s*[\r\n]+\s*\.chat-card\.group-list-card \.chat-preview\s*\{[\s\S]*line-height:\s*1\.2;/u)
  assert.match(handoffDoc, /карточки групп и каналов в левом списке используют общий avatar-layout/u)
  assert.match(handoffDoc, /direct dialog cards используют отдельный [`']?dialog-list-card[`']? avatar-slot/u)
  assert.match(rolloutDoc, /карточки групп и каналов в левом списке должны держать одинаковую avatar-геометрию/u)
  assert.match(rolloutDoc, /карточки прямых диалогов должны использовать увеличенный [`']?dialog-list-card[`']? avatar-slot/u)
  assert.match(releaseDoc, /### 11\.1\.2\. Group And Channel Left Rail Card Contract/u)
  assert.match(releaseDoc, /group\/channel cards в левом списке должны использовать одинаковую avatar-геометрию/u)
  assert.match(releaseDoc, /### 11\.1\.3\. Direct Dialog Left Rail Avatar Contract/u)
  assert.match(releaseDoc, /direct dialog cards в левом списке должны использовать отдельный [`']?dialog-list-card[`']? avatar-slot/u)
})

test('direct dialog cards keep compact preview layout and lighter dark-theme surface', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appSource,
    /orderedVisibleChats\.map\(\(chat\) => \{[\s\S]*const latestMessage = chat\.messages\.at\(-1\)[\s\S]*const chatPreview = chat\.messages\.length > 0 \? formatPreview\(chat\) : formatContactStatus\(chat\)/u,
  )
  assert.match(appSource, /<span className="chat-preview chat-status-preview">\{chatPreview\}<\/span>/u)
  assert.match(
    appCss,
    /\.chat-card\.dialog-list-card \.chat-copy\s*\{[\s\S]*gap:\s*2px;[\s\S]*align-self:\s*center;/u,
  )
  assert.match(
    appCss,
    /\.chat-card\.dialog-list-card \.chat-topline\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*10px;/u,
  )
  assert.match(appCss, /\.chat-card\.dialog-list-card \.chat-preview\s*\{[\s\S]*line-height:\s*1\.18;/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.chat-card\.dialog-list-card\s*\{[\s\S]*background:\s*rgba\(40,\s*42,\s*50,\s*0\.98\);[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.chat-card\.dialog-list-card\.active\s*\{[\s\S]*background:\s*rgba\(52,\s*55,\s*65,\s*0\.98\);/u,
  )
})

test('group snapshots materialize participant avatar images for left-rail preview authors', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79993330001', {
    avatarImage: 'https://cdn.test/owner-avatar.webp',
  })
  owner.displayName = 'Владелец Группы'
  const participant = createAccount('+79993330002', {
    avatarImage: 'https://cdn.test/member-avatar.webp',
  })
  participant.displayName = 'Яркий Участник'

  database.accounts.push(owner, participant)
  const ownerToken = createSession(database, owner.identifier, 'group-owner')

  database.groups.push({
    accent: '#8c5738',
    archiveReason: undefined,
    archivedAt: undefined,
    avatarImage: 'https://cdn.test/group-avatar.webp',
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: true,
    commentsEnabledForPremium: false,
    creatorIdentifier: owner.identifier,
    description: '',
    groupOwnerIdentifier: owner.identifier,
    handle: '@preview-group',
    id: 1,
    isTestEntity: false,
    latestActivityAt: '2026-04-09T09:00:00.000Z',
    members: 2,
    muted: false,
    ownerIdentifier: owner.identifier,
    participants: [
      {
        accent: '#8c5738',
        id: 1,
        identifier: owner.identifier,
        title: owner.displayName,
        status: 'На связи',
      },
      {
        accent: '#3b82f6',
        id: 2,
        identifier: participant.identifier,
        title: participant.displayName,
        status: 'На связи',
      },
    ],
    preview: '',
    sharedId: 'group-preview-shared',
    showHistoryToNewMembers: true,
    time: '09:00',
    title: 'Группа с превью',
    unread: 0,
  })

  database.groupMessages.push({
    author: 'them',
    createdAt: '2026-04-09T09:00:00.000Z',
    deliveryId: 'preview-author-message',
    displayAuthor: participant.displayName,
    groupId: 1,
    groupParticipantId: 2,
    id: 1,
    ownerIdentifier: owner.identifier,
    text: 'Последнее сообщение',
    threadComments: [],
    threadId: 'group:1:1',
    time: '09:00',
  })

  const snapshot = store.getSnapshotByToken(ownerToken)
  assert.ok(snapshot)

  const materializedGroup = snapshot.groups.find((group) => group.id === 1) ?? null
  assert.ok(materializedGroup)

  const materializedParticipant =
    materializedGroup?.participants.find((candidate) => candidate.id === 2) ?? null
  assert.equal(materializedParticipant?.avatarImage, participant.avatarImage)
  assert.equal(materializedParticipant?.title, participant.displayName)
  assert.equal(materializedGroup?.messages.at(-1)?.groupParticipantId, 2)
  assert.equal(materializedGroup?.messages.at(-1)?.displayAuthor, participant.displayName)
})

test('settings storage scene stays wired to user-manageable media only', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const appBackendSource = readFileSync(join(process.cwd(), 'src/app/backend.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(process.cwd(), 'src/shared/backend.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(process.cwd(), 'src/shared/types.ts'), 'utf8')
  const storeSource = readFileSync(join(process.cwd(), 'server/src/store.ts'), 'utf8')
  const indexSource = readFileSync(join(process.cwd(), 'server/src/index.ts'), 'utf8')
  const handoffDoc = readFileSync(join(process.cwd(), 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(process.cwd(), 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(process.cwd(), 'docs', 'release-contracts.md'), 'utf8')

  assert.match(sharedTypesSource, /reason: 'storage-quota' \| 'storage-manual'/u)
  assert.match(sharedTypesSource, /export type UserStorageItem = \{/u)
  assert.match(sharedTypesSource, /kind: 'attachment'/u)
  assert.match(sharedTypesSource, /export type SettingsView = 'profile' \| 'management' \| 'blocked' \| 'quiet' \| 'support' \| 'storage'/u)
  assert.match(sharedBackendSource, /export type UserStorageItemsResponse = StoragePrimaryItemsResponse/u)
  assert.match(appBackendSource, /fetchUserStorageItems/u)
  assert.match(appBackendSource, /deleteUserStorageItem/u)
  assert.match(indexSource, /\/api\/session\/storage-items/u)
  assert.match(appBackendSource, /makeJsonRequestInit\('DELETE', \{ storageItemId \}/u)
  assert.match(indexSource, /app\.delete\('\/api\/session\/storage-items', handleDeleteSessionStorageItem\)/u)
  assert.match(storeSource, /buildStorageManualAttachmentRemovedNoticeText/u)
  assert.match(storeSource, /Вложение удалено владельцем из хранилища, чтобы освободить место/u)
  assert.match(storeSource, /Вложение удалено вами из хранилища, чтобы освободить место/u)
  assert.match(storeSource, /for \(const ticket of this\.database\.supportTickets\)/u)
  assert.match(storeSource, /primaryLabel: 'Обращение в поддержку'/u)
  assert.match(
    storeSource,
    /buildPrimaryStorageInventoryForSubject[\s\S]*if \(reference\.kind !== 'attachment'\) continue/u,
  )
  assert.doesNotMatch(storeSource, /kind: 'profile-avatar'[\s\S]{0,120}primaryLabel/u)
  assert.match(appSource, /settingsView === 'storage'/u)
  assert.match(appSource, /settings-panel-storage/u)
  assert.match(appSource, /event\.stopPropagation\(\)/u)
  assert.match(appSource, /Открыть хранилище и освободить место/u)
  assert.match(appSource, /fetchUserStorageItemsRequest/u)
  assert.match(appSource, /deleteUserStorageItemRequest/u)
  assert.match(appSource, /Хранилище пока свободно/u)
  assert.match(appSource, /Аватарки и общая GIF-библиотека живут отдельно во внешнем хранилище Тайничка/u)
  assert.match(appCss, /\.settings-stack-storage/u)
  assert.match(appCss, /\.settings-panel-storage/u)
  assert.match(appCss, /\.settings-storage-grid/u)
  assert.match(appCss, /\.settings-storage-card/u)
  assert.match(appCss, /\.settings-storage-delete/u)
  assert.match(appCss, /\.storage-usage-card-button/u)
  assert.match(storeSource, /must stay path-safe/u)
  assert.match(handoffDoc, /экран `Хранилище` внутри настроек показывает только вложения/u)
  assert.match(handoffDoc, /аватарки профиля, группы и канала считаются внешним хранилищем Tinychok/u)
  assert.match(rolloutDoc, /`Хранилище` в настройках открывает отдельный storage-screen/u)
  assert.match(rolloutDoc, /в storage-screen попадают только message attachments и support\/thread attachments/u)
  assert.match(releaseDoc, /аватарки профиля, группы и канала не входят в пользовательскую квоту/u)
  assert.match(releaseDoc, /ручное удаление из storage-screen оставляет placeholder вместо пустого bubble/u)
})

test('group settings and admin no longer expose group storage, while channel storage keeps the raised quota', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const adminAppSource = readFileSync(join(process.cwd(), 'src/AdminApp.tsx'), 'utf8')
  const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const indexSource = readFileSync(join(process.cwd(), 'server/src/index.ts'), 'utf8')
  const storeSource = readFileSync(join(process.cwd(), 'server/src/store.ts'), 'utf8')
  const constantsSource = readFileSync(join(process.cwd(), 'src/shared/constants.ts'), 'utf8')
  const handoffDoc = readFileSync(join(process.cwd(), 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(process.cwd(), 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(process.cwd(), 'docs', 'release-contracts.md'), 'utf8')

  assert.doesNotMatch(appSource, /Вложения, отправленные в группу, теперь хранятся в личном хранилище автора сообщения/u)
  assert.doesNotMatch(appSource, /fetchGroupStorageItemsRequest/u)
  assert.doesNotMatch(appSource, /deleteGroupStorageItemRequest/u)
  assert.doesNotMatch(adminAppSource, /handleDownloadCurrentStorage\('group'/u)
  assert.doesNotMatch(adminAppSource, /handleDownloadArchiveStorage\('group'/u)
  assert.doesNotMatch(adminAppSource, /handleToggleArchiveUnlimited\(\s*'group'/u)
  assert.doesNotMatch(adminAppSource, /selectedGroup\.storageUsage/u)
  assert.doesNotMatch(adminAppSource, /selectedGroup\.archiveStorageUsage/u)
  assert.doesNotMatch(adminAppSource, /selectedGroup\.archiveUnlimited/u)
  assert.match(storeSource, /Хранилище групп отключено\. Медиа группы хранится в личном хранилище автора/u)
  assert.doesNotMatch(storeSource, /private getGroupStorageSubject/u)
  assert.match(appSource, /setChannelDetailView\('storage'\)/u)
  assert.match(appSource, /openCopy: 'Открыть хранилище канала'/u)
  assert.match(appSource, /subjectLabel: 'Канала'/u)
  assert.match(appSource, /title: 'Хранилище'/u)
  assert.match(appSource, /className="settings-item settings-storage-items-panel"/u)
  assert.match(appSource, /className="soft-button settings-storage-scroll-top-button"/u)
  assert.match(appSource, /compact: true/u)
  assert.match(appSource, /className="storage-usage-upsell-icon"/u)
  assert.match(appSource, /<img src="\/icons\/crown64\.png" alt="" \/>/u)
  assert.doesNotMatch(appSource, /renderManagedStorageSection/u)
  assert.match(appCss, /\.settings-stack-channel-storage/u)
  assert.match(appCss, /\.channels-detail-actions-top/u)
  assert.match(appCss, /\.settings-storage-items-panel/u)
  assert.match(appCss, /\.settings-storage-scroll-top-button/u)
  assert.match(appCss, /\.storage-usage-title-stack/u)
  assert.match(appCss, /\.storage-usage-open-pill/u)
  assert.match(appCss, /\.storage-usage-upsell-icon/u)
  assert.match(appCss, /\.settings-storage-grid\.compact/u)
  assert.match(appCss, /\.settings-storage-card\.compact/u)
  assert.match(indexSource, /app\.get\('\/api\/groups\/:groupId\/storage-items'/u)
  assert.match(indexSource, /Compatibility shim for cached clients: groups no longer have their own storage surface/u)
  assert.match(constantsSource, /export const channelStorageQuotaBytes = 500 \* 1024 \* 1024/u)
  assert.match(constantsSource, /export const premiumStorageQuotaBytes = 1000 \* 1024 \* 1024/u)
  assert.match(handoffDoc, /группа больше не имеет собственного хранилища/u)
  assert.match(handoffDoc, /все вложения из группы, включая корневые сообщения и треды, считаются в личном хранилище автора/u)
  assert.match(handoffDoc, /channel primary quota: `500 MB`/u)
  assert.match(rolloutDoc, /группа больше не имеет собственного storage-subject/u)
  assert.match(rolloutDoc, /корневые group attachments и group thread attachments считаются в личном хранилище автора/u)
  assert.match(releaseDoc, /group root attachments и group thread attachments хранятся в storage автора/u)
  assert.match(releaseDoc, /channel post attachments остаются в storage канала с квотой `500 MB`/u)
})

test('group settings keep avatar change wired through the existing group avatar picker flow', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const groupSettingsFlowSource = readFileSync(join(process.cwd(), 'src/app/useGroupSettingsFlow.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(process.cwd(), 'src/shared/utils.ts'), 'utf8')

  assert.match(groupSettingsFlowSource, /export type GroupSettingsDraft = Pick<[\s\S]*\| 'avatarImage'/u)
  assert.match(groupSettingsFlowSource, /avatarImage: group\.avatarImage,/u)
  assert.match(
    groupSettingsFlowSource,
    /\(groupSettingsDraft\.avatarImage \|\| undefined\) !== \(activeGroup\.avatarImage \|\| undefined\)/u,
  )
  assert.match(groupSettingsFlowSource, /avatarImage: groupSettingsDraft\.avatarImage,/u)
  assert.match(sharedUtilsSource, /export function sanitizeGroupTitle\(value: string\)/u)
  assert.match(groupSettingsFlowSource, /import \{ sanitizeGroupTitle \} from '\.\/utils'/u)
  assert.match(groupSettingsFlowSource, /sanitizeGroupTitle\(groupSettingsDraft\.title\) !== activeGroup\.title/u)
  assert.match(groupSettingsFlowSource, /const nextTitle = sanitizeGroupTitle\(groupSettingsDraft\.title\)/u)
  assert.doesNotMatch(groupSettingsFlowSource, /sanitizeChannelTitle/u)
  assert.match(appSource, /type GroupAvatarPickerTarget =[\s\S]*\| \{ scope: 'existing'; groupId: number \}/u)
  assert.match(appSource, /setGroupSettingsAvatarDraft/u)
  assert.match(appSource, /updateGroupSettingsDraft\(\{ avatarImage: nextDraft\.previewUrl \}\)/u)
  assert.match(appSource, /onClick=\{\(\) => openGroupAvatarPicker\(\{ scope: 'create' \}\)\}/u)
  assert.match(
    appSource,
    /onClick=\{\(\) => openGroupAvatarPicker\(\{ groupId: activeGroup\.id, scope: 'existing' \}\)\}/u,
  )
  assert.match(appSource, /<span className="settings-label">Аватарка группы<\/span>/u)
  assert.match(appSource, /groupSettingsDraft\?\.avatarImage \? \(/u)
  assert.match(appSource, /Можно загрузить JPG, PNG либо WebP до 5 МБ\./u)
})

test('channel title length stays aligned with the group title limit across sanitizing and editor inputs', () => {
  const constantsSource = readFileSync(join(process.cwd(), 'src/shared/constants.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(process.cwd(), 'src/shared/utils.ts'), 'utf8')
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const storeSource = readFileSync(join(process.cwd(), 'server/src/store.ts'), 'utf8')

  assert.match(constantsSource, /export const groupTitleMaxLength = 48/u)
  assert.match(constantsSource, /export const channelTitleMaxLength = groupTitleMaxLength/u)
  assert.match(sharedUtilsSource, /export function sanitizeChannelTitle\(value: string\) \{[\s\S]*slice\(0, channelTitleMaxLength\)/u)
  assert.match(appSource, /maxLength=\{channelTitleMaxLength\}/u)
  assert.match(appSource, /event\.target\.value\.slice\(0, channelTitleMaxLength\)/u)
  assert.match(appSource, /sanitizeChannelTitle\(creatingChannelTitle\) \|\| `Новый канал/u)
  assert.match(appSource, /const nextTitle = sanitizeChannelTitle\(editingChannelTitleValue\)/u)
  assert.match(storeSource, /const title = sanitizeChannelTitle\(payload\.title\) \|\| `Новый канал/u)
  assert.match(storeSource, /const nextTitle = sanitizeChannelTitle\(payload\.title\)/u)
})

test('owner-only admin storage exports stay wired to password-confirmed ZIP download and archive controls', () => {
  const adminAppSource = readFileSync(join(process.cwd(), 'src/AdminApp.tsx'), 'utf8')
  const backendSource = readFileSync(join(process.cwd(), 'src/app/backend.ts'), 'utf8')
  const routesSource = readFileSync(join(process.cwd(), 'server/src/admin-routes.ts'), 'utf8')
  const storeSource = readFileSync(join(process.cwd(), 'server/src/store.ts'), 'utf8')
  const adminCssSource = readFileSync(join(process.cwd(), 'src/admin.css'), 'utf8')
  const permissionsSource = readFileSync(join(process.cwd(), 'server/src/admin-permissions.ts'), 'utf8')

  assert.match(adminAppSource, /startAdminStorageExportJob/u)
  assert.match(adminAppSource, /fetchAdminStorageExportJob/u)
  assert.match(adminAppSource, /downloadAdminStorageExportJob/u)
  assert.match(adminAppSource, /cancelAdminStorageExportJob/u)
  assert.match(adminAppSource, /storageExportOverlay/u)
  assert.match(adminAppSource, /downloadedBytes/u)
  assert.match(adminAppSource, /downloadTotalBytes/u)
  assert.match(adminAppSource, /downloadProgressPercent/u)
  assert.match(adminAppSource, /handleToggleArchiveUnlimited/u)
  assert.match(adminAppSource, /Подготавливаем архив/u)
  assert.match(adminAppSource, /Архив собран\. Передаём его браузеру для скачивания/u)
  assert.match(adminAppSource, /Передано:/u)
  assert.match(adminAppSource, /Отмена/u)
  assert.match(adminAppSource, /getPromptedCurrentPassword/u)
  assert.match(adminAppSource, /bootstrap\.actor\.permissions\.includes\('users\.media\.export'\)/u)
  assert.match(adminAppSource, /Выгрузка активного хранилища/u)
  assert.match(adminAppSource, /Выгрузка архивного хранилища/u)
  assert.match(adminAppSource, /Пользователи/u)
  assert.match(adminAppSource, /\/icons\/eyeon\.png/u)
  assert.match(adminAppSource, /\/icons\/lock\.png/u)
  assert.match(adminAppSource, /\/icons\/crown64\.png/u)
  assert.match(adminAppSource, /handleDownloadCurrentStorage\('user', selectedUser\.identifier, selectedUser\.displayName\)/u)
  assert.match(adminAppSource, /handleDownloadArchiveStorage\('user', selectedUser\.identifier, selectedUser\.displayName\)/u)
  assert.match(adminAppSource, /handleToggleArchiveUnlimited\(\s*'user',\s*selectedUser\.identifier/u)
  assert.match(adminAppSource, /Выключить ограничение архивного хранилища/u)
  assert.match(adminAppSource, /setAdminUserReportIntake/u)
  assert.match(adminAppSource, /Перестать принимать жалобы от пользователя/u)
  assert.match(adminAppSource, /Заблокированные/u)
  assert.match(adminAppSource, /Заблокировать/u)
  assert.match(adminAppSource, /Разблокировать/u)
  assert.match(adminAppSource, /Выдать premium/u)
  assert.match(adminAppSource, /Снять premium/u)
  assert.match(backendSource, /\/api\/admin\/storage\/export-jobs/u)
  assert.match(backendSource, /encodeURIComponent\(jobId\)\}\/download/u)
  assert.match(backendSource, /response\.body\.getReader\(\)/u)
  assert.match(backendSource, /content-length/u)
  assert.match(backendSource, /\/api\/admin\/storage\/export/u)
  assert.match(backendSource, /\/api\/admin\/storage\/archive-export/u)
  assert.match(backendSource, /\/api\/admin\/storage\/archive-toggle/u)
  assert.match(backendSource, /\/api\/admin\/users\/\$\{encodeURIComponent\(identifier\)\}\/report-intake/u)
  assert.match(routesSource, /\/api\/admin\/storage\/export-jobs/u)
  assert.match(routesSource, /\/api\/admin\/storage\/export-jobs\/:jobId\/cancel/u)
  assert.match(routesSource, /\/api\/admin\/users\/:identifier\/report-intake/u)
  assert.match(routesSource, /serializeAdminStorageExportJob/u)
  assert.match(routesSource, /requireAdminActor\(store, request, reply, 'users\.archive\.export'\)/u)
  assert.match(routesSource, /requireAdminActor\(store, request, reply, 'users\.archive\.manage'\)/u)
  assert.match(routesSource, /requireAdminActor\(store, request, reply, 'users\.block'\)/u)
  assert.match(storeSource, /Подготовка архива отменена\./u)
  assert.match(storeSource, /onProgress/u)
  assert.match(storeSource, /reportProgress\('zipping'\)/u)
  assert.match(storeSource, /Archive export must reflect only the real archive storage inventory/u)
  assert.doesNotMatch(storeSource, /collectAdminOwnedMediaExportItems\(subject, \{ archiveOnly: true \}\)/u)
  assert.match(storeSource, /admin\.storage\.current-export\.download/u)
  assert.match(storeSource, /admin\.storage\.archive-export\.download/u)
  assert.match(storeSource, /admin\.storage\.archive-unlimited\.toggle/u)
  assert.match(storeSource, /adminSetUserReportsMutedInAdmin/u)
  assert.match(storeSource, /findVisibleAdminReport/u)
  assert.match(adminCssSource, /\.admin-progress-modal/u)
  assert.match(adminCssSource, /\.admin-progress-bar-fill/u)
  assert.match(adminCssSource, /\.admin-progress-bar-fill-indeterminate/u)
  assert.match(adminCssSource, /@keyframes admin-progress-bar-indeterminate/u)
  assert.match(permissionsSource, /'users\.media\.export'/u)
  assert.match(permissionsSource, /'users\.archive\.export'/u)
  assert.match(permissionsSource, /'users\.archive\.manage'/u)
})

test('clipboard image paste stays wired into every composer surface', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(process.cwd(), 'src/rooms/DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(process.cwd(), 'src/rooms/GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(
    join(process.cwd(), 'src/rooms/SubscriptionChannelRoom.tsx'),
    'utf8',
  )
  const roomComposerSource = readFileSync(join(process.cwd(), 'src/components/RoomComposer.tsx'), 'utf8')

  assert.match(appSource, /function getClipboardImageFile\(event: ReactClipboardEvent<HTMLElement>\)/u)
  assert.match(appSource, /async function handlePastedComposerImage\(/u)
  assert.match(appSource, /Clipboard images must go through the exact same composer draft pipeline as picker uploads/u)
  assert.match(appSource, /there is no image in the clipboard, we must not block the regular text paste behavior/u)
  assert.match(appSource, /handleChatComposerPaste/u)
  assert.match(appSource, /handleGroupComposerPaste/u)
  assert.match(appSource, /handleChannelComposerPaste/u)
  assert.match(appSource, /handleThreadComposerPaste/u)
  assert.match(appSource, /handleSupportComposerPaste/u)
  assert.match(appSource, /surface: 'support'/u)
  assert.match(appSource, /supportAttachmentDraft/u)
  assert.match(appSource, /attachment: resolvedAttachment\.attachment/u)
  assert.match(appSource, /onComposerPaste=\{handleSupportComposerPaste\}/u)
  assert.match(appSource, /After image compression\/re-encode the stored upload can have a different file name/u)
  assert.match(appSource, /fileName: uploadedMedia\.fileName/u)
  assert.match(directRoomSource, /onComposerPaste\?: \(event: ClipboardEvent<HTMLTextAreaElement>\)/u)
  assert.doesNotMatch(directRoomSource, /<ComposerRichInput/u)
  assert.match(directRoomSource, /onComposerPaste=\{onComposerPaste\}/u)
  assert.match(groupRoomSource, /onComposerPaste\?: \(event: ClipboardEvent<HTMLTextAreaElement>\)/u)
  assert.doesNotMatch(groupRoomSource, /<ComposerRichInput/u)
  assert.match(groupRoomSource, /<RoomComposer[\s\S]*onComposerPaste=\{onComposerPaste\}/u)
  assert.match(channelRoomSource, /onComposerPaste\?: \(event: ClipboardEvent<HTMLTextAreaElement>\)/u)
  assert.doesNotMatch(channelRoomSource, /<ComposerRichInput/u)
  assert.match(
    channelRoomSource,
    /<RoomComposer[\s\S]*onComposerPaste=\{\(event\) => publisherOnComposerPaste\?\.\(event\)\}/u,
  )
  assert.match(roomComposerSource, /onPaste=\{onComposerPaste\}/u)
  assert.match(roomComposerSource, /<textarea/u)
  assert.match(groupRoomSource, /<RoomComposer/u)
  assert.match(channelRoomSource, /<RoomComposer/u)
})

test('admin support ticket detail renders attachments for root ticket and comments', () => {
  const adminAppSource = readFileSync(join(process.cwd(), 'src/AdminApp.tsx'), 'utf8')
  const adminCssSource = readFileSync(join(process.cwd(), 'src/admin.css'), 'utf8')

  assert.match(adminAppSource, /function renderAdminSupportAttachment\(/u)
  assert.match(adminAppSource, /className="admin-detail-link-card"/u)
  assert.match(adminAppSource, /onClick=\{\(\) => void openUserFromAdmin\(selectedSupportTicket\.owner\.identifier\)\}/u)
  assert.match(adminAppSource, /selectedSupportTicket\.attachment/u)
  assert.match(adminAppSource, /comment\.attachment/u)
  assert.match(adminAppSource, /mimeType\?\.startsWith\('image\/'\)/u)
  assert.match(adminAppSource, /admin-support-attachment-preview/u)
  assert.match(adminAppSource, /admin-support-file-card/u)
  assert.match(adminCssSource, /\.admin-detail-link-card/u)
  assert.match(adminCssSource, /\.admin-support-attachment/u)
  assert.match(adminCssSource, /\.admin-support-attachment-preview/u)
})

test('thread source attachments stay compact previews instead of full-room media bubbles', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const appCssSource = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const bubbleMessageContentSource = readFileSync(
    join(process.cwd(), 'src/components/BubbleMessageContent.tsx'),
    'utf8',
  )

  assert.match(appSource, /channel-thread source is not the same surface as support-thread source/u)
  assert.match(appSource, /room-thread-source-bubble-inline-time/u)
  assert.match(appSource, /stretch full-width like a proper reference card/u)
  assert.match(appSource, /attachmentLayout=\{/u)
  assert.match(appSource, /usesThumbnailImageLayout\s*\?\s*'thread-source-thumbnail'/u)
  assert.match(appSource, /room-thread-source-bubble-thumbnail/u)
  assert.doesNotMatch(appSource, /const threadSourceAuthorNode =/u)
  assert.doesNotMatch(appSource, /className="bubble-author-layout room-thread-source-author-layout"/u)
  assert.doesNotMatch(appCssSource, /room-thread-source-author-layout/u)
  assert.match(appCssSource, /\.room-thread-source > \.bubble-stack,/u)
  assert.match(appCssSource, /\.room-thread-source > \.bubble-stack\.channel \{/u)
  assert.match(appCssSource, /width: calc\(100% \+ 36px\);/u)
  assert.match(appCssSource, /margin: 0 -18px;/u)
  assert.match(
    appCssSource,
    /\.room-thread-header\.room-header \{[\s\S]*border-bottom-left-radius: 0;[\s\S]*border-bottom-right-radius: 0;[\s\S]*border-bottom-color: transparent;/u,
  )
  assert.match(appCssSource, /\.room-thread-source \.channel-post\.room-thread-source-bubble,/u)
  assert.match(appCssSource, /max-width: 100%;/u)
  assert.match(appCssSource, /box-sizing: border-box;/u)
  assert.match(
    appCssSource,
    /\.room-thread-source > \.bubble-stack > \.bubble-stack-main > \.room-thread-source-bubble,\s*\.room-thread-source > \.room-thread-source-bubble \{/u,
  )
  assert.match(appCssSource, /justify-self: stretch;/u)
  assert.match(appCssSource, /border-top-left-radius: 0;/u)
  assert.match(appCssSource, /border-top-right-radius: 0;/u)
  assert.match(appCssSource, /background:\s*linear-gradient\(180deg, rgba\(255, 254, 251, 0.985\) 0%, rgba\(255, 251, 245, 0.95\) 100%\);/u)
  assert.match(
    appCssSource,
    /\.room-thread-source \.room-thread-source-bubble \.bubble-attachment-removed-note-link \{[\s\S]*color:\s*#8d5939;[\s\S]*text-decoration-color:\s*rgba\(141,\s*89,\s*57,\s*0\.5\);/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source\s*>\s*\.bubble-stack\s*>\s*\.bubble-stack-main\s*>\s*\.room-thread-source-bubble\.room-thread-source-bubble-inline-time,\s*\.room-thread-source > \.room-thread-source-bubble\.room-thread-source-bubble-inline-time \{/u,
  )
  assert.match(appCssSource, /grid-template-columns: minmax\(0, 1fr\) auto;/u)
  assert.match(
    bubbleMessageContentSource,
    /attachmentLayout\?: 'default' \| 'thread-source-thumbnail' \| 'thread-source-card'/u,
  )
  assert.match(
    bubbleMessageContentSource,
    /bubble-attachment-photo-thread-source-thumbnail/u,
  )
  assert.match(
    bubbleMessageContentSource,
    /bubble-attachment-image-thread-source-thumbnail/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail[\s\S]*\.bubble-attachment-photo-thread-source-thumbnail/u,
  )
  assert.match(appCssSource, /width: min\(124px, 100%\)/u)
  assert.match(appCssSource, /height: 102px;/u)
  assert.match(appCssSource, /\.bubble-attachment-image-overlay/u)
  assert.match(appCssSource, /\.room-thread-feed \{\s*min-height: 0;\s*padding-top: 0;/u)
})

test('thread source image cards use dedicated full-width card layouts for captioned and image-only roots', () => {
  const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8')
  const appCssSource = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
  const bubbleMessageContentSource = readFileSync(
    join(process.cwd(), 'src/components/BubbleMessageContent.tsx'),
    'utf8',
  )

  assert.match(appSource, /const usesCaptionedImageCardLayout =/u)
  assert.match(appSource, /const usesImageOnlyCardLayout =/u)
  assert.match(appSource, /room-thread-source-bubble-thumbnail-captioned/u)
  assert.match(appSource, /room-thread-source-bubble-thumbnail-image-only-card/u)
  assert.match(
    appSource,
    /attachmentLayout=\{\s*usesCaptionedImageCardLayout \|\| usesImageOnlyCardLayout\s*\?\s*'thread-source-card'\s*:\s*usesThumbnailImageLayout\s*\?\s*'thread-source-thumbnail'\s*:\s*undefined\s*\}/u,
  )
  assert.match(appSource, /hasImageAttachment && !usesCaptionedImageCardLayout && !usesImageOnlyCardLayout/u)
  assert.match(
    bubbleMessageContentSource,
    /bubble-attachment-photo-thread-source-card/u,
  )
  assert.match(
    bubbleMessageContentSource,
    /bubble-attachment-image-thread-source-card/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail-image-only-card[\s\S]*grid-template-columns: 124px minmax\(0, 1fr\) auto;/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail-image-only-card[\s\S]*>\s*time[\s\S]*grid-column: 3;[\s\S]*justify-self: end;/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail-captioned[\s\S]*grid-template-columns: 124px minmax\(0, 1fr\) auto;/u,
  )
  assert.match(
    appCssSource,
    /\.bubble-attachment-photo-thread-source-card \{\s*grid-column: 1;[\s\S]*margin: -16px 0 -16px -18px;/u,
  )
  assert.match(
    appCssSource,
    /\.bubble-attachment-image-thread-source-card \{\s*width: 124px;[\s\S]*height: 124px;/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail-image-only-card[\s\S]*\.bubble-attachment-photo-thread-source-card[\s\S]*border-radius: 0 0 0 24px;/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble\.room-thread-source-bubble-thumbnail-captioned[\s\S]*\.bubble-attachment-image-thread-source-card[\s\S]*border-radius: 0 0 0 24px;/u,
  )
  assert.match(
    appCssSource,
    /\.room-thread-source[\s\S]*\.room-thread-source-bubble:not\(\.mine\)\.room-thread-source-bubble-thumbnail-image-only-card[\s\S]*\.bubble-attachment-image-thread-source-card[\s\S]*border-radius: 0 0 0 24px;/u,
  )
})

test('direct chat snapshots propagate contact avatar updates', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005001')
  const contact = createAccount('+79990005002')

  database.accounts.push(viewer, contact)
  const viewerToken = createSession(database, viewer.identifier, 'viewer')
  const contactToken = createSession(database, contact.identifier, 'contact')

  await store.openDirectDialog(viewerToken, { identifier: contact.identifier })
  await store.updateSession(contactToken, {
    avatarImage: 'uploads/avatars/contact-avatar.png',
  })

  const viewerSnapshot = store.getSnapshotByToken(viewerToken)
  const viewerChat = viewerSnapshot?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.avatarImage, 'uploads/avatars/contact-avatar.png')
})

test('stale persisted dialogs inherit contact avatar on snapshot load', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005011')
  const contact = createAccount('+79990005012', {
    avatarImage: 'uploads/avatars/stale-contact-avatar.png',
  })

  database.accounts.push(viewer, contact)
  const viewerToken = createSession(database, viewer.identifier, 'viewer-stale')

  database.dialogs.push({
    accent: '#8c5738',
    avatarImage: undefined,
    handle: '',
    id: 1,
    isTestEntity: false,
    lastSeen: undefined,
    mood: 'На связи',
    muted: false,
    online: false,
    ownerIdentifier: viewer.identifier,
    phone: contact.identifier,
    pinned: false,
    premium: false,
    status: 'в сети',
    title: 'Старый контакт',
    typing: false,
    unread: 0,
  })

  const viewerSnapshot = store.getSnapshotByToken(viewerToken)
  const viewerChat = viewerSnapshot?.chats.find((chat) => chat.phone === contact.identifier)
  assert.equal(viewerChat?.avatarImage, 'uploads/avatars/stale-contact-avatar.png')
})

test('premium invisibility hides live presence from other users in direct chats', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005013')
  const invisibleContact = createAccount('+79990005014', {
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
  })

  database.accounts.push(viewer, invisibleContact)
  const viewerToken = createSession(database, viewer.identifier, 'viewer-invisible-direct')
  const invisibleToken = createSession(database, invisibleContact.identifier, 'invisible-direct')
  markSessionLive(store, invisibleToken)

  await store.openDirectDialog(viewerToken, { identifier: invisibleContact.identifier })

  const viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find(
    (chat) => chat.phone === invisibleContact.identifier,
  )
  assert.equal(viewerChat?.online, false)
  assert.equal(viewerChat?.lastSeen, 'был(а) недавно в сети')
  assert.equal(viewerChat?.status, 'был(а) недавно в сети')

  const invisibleSnapshot = store.getSnapshotByToken(invisibleToken)
  assert.equal(invisibleSnapshot?.session.invisibilityEnabled, true)
  assert.equal(invisibleSnapshot?.session.premium, true)
})

test('invisibility without premium does not hide live presence from other users', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005015')
  const quietContact = createAccount('+79990005016', {
    invisibilityEnabled: true,
  })

  database.accounts.push(viewer, quietContact)
  const viewerToken = createSession(database, viewer.identifier, 'viewer-quiet-without-premium')
  const quietToken = createSession(database, quietContact.identifier, 'quiet-without-premium')
  markSessionLive(store, quietToken)

  await store.openDirectDialog(viewerToken, { identifier: quietContact.identifier })

  const viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find(
    (chat) => chat.phone === quietContact.identifier,
  )
  assert.equal(viewerChat?.online, true)
  assert.equal(viewerChat?.status, 'в сети')
})

test('premium user stays visible when invisibility is turned off', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005019')
  const visiblePremiumContact = createAccount('+79990005020', {
    invisibilityEnabled: false,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: true,
  })

  database.accounts.push(viewer, visiblePremiumContact)
  const viewerToken = createSession(database, viewer.identifier, 'viewer-visible-premium-direct')
  const visiblePremiumToken = createSession(database, visiblePremiumContact.identifier, 'visible-premium-direct')
  markSessionLive(store, visiblePremiumToken)

  await store.openDirectDialog(viewerToken, { identifier: visiblePremiumContact.identifier })

  const viewerChat = store.getSnapshotByToken(viewerToken)?.chats.find(
    (chat) => chat.phone === visiblePremiumContact.identifier,
  )
  assert.equal(viewerChat?.online, true)
  assert.equal(viewerChat?.status, 'в сети')
})

test('premium invisibility hides live presence from other users in group participants', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990005017')
  const invisibleParticipant = createAccount('+79990005018', {
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
  })

  database.accounts.push(viewer, invisibleParticipant)
  const viewerToken = createSession(database, viewer.identifier, 'viewer-group-invisible')
  const invisibleParticipantToken = createSession(database, invisibleParticipant.identifier, 'participant-group-invisible')
  markSessionLive(store, invisibleParticipantToken)

  database.groups.push({
    accent: '#8c5738',
    archivedAt: undefined,
    archiveReason: undefined,
    avatarImage: undefined,
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: true,
    commentsEnabledForPremium: false,
    creatorIdentifier: viewer.identifier,
    description: '',
    groupOwnerIdentifier: viewer.identifier,
    handle: '@group-invisible',
    id: 1,
    isTestEntity: false,
    members: 1,
    muted: false,
    ownerIdentifier: viewer.identifier,
    participants: [{
      accent: '#8c5738',
      archivedAccount: false,
      favorite: false,
      id: 1,
      identifier: invisibleParticipant.identifier,
      nickname: '',
      online: true,
      premium: true,
      status: 'в сети',
      title: invisibleParticipant.displayName,
    }],
    preview: '',
    sharedId: 'group-invisible',
    time: '12:00',
    title: 'Invisible participant group',
    unread: 0,
  })

  const viewerGroup = store.getSnapshotByToken(viewerToken)?.groups.find((group) => group.id === 1)
  const participant = viewerGroup?.participants.find(
    (candidate) => candidate.identifier === invisibleParticipant.identifier,
  )
  assert.equal(participant?.online, false)
  assert.equal(participant?.status, 'был(а) недавно в сети')
})

test('premium invisibility suppresses mirrored direct read receipts while still clearing local unread', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79990005041')
  const invisibleReader = createAccount('+79990005042', {
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
  })

  database.accounts.push(sender, invisibleReader)
  seedAcceptedContactLink(database, sender.identifier, invisibleReader.identifier)
  const senderToken = createSession(database, sender.identifier, 'sender-invisible-read')
  const readerToken = createSession(database, invisibleReader.identifier, 'reader-invisible-read')

  const senderDialogResponse = await store.openDirectDialog(senderToken, { identifier: invisibleReader.identifier })
  const readerDialogResponse = await store.openDirectDialog(readerToken, { identifier: sender.identifier })
  await store.sendDirectMessage(senderToken, senderDialogResponse.dialogId, { text: 'secret read receipt' })

  await store.markDialogRead(readerToken, readerDialogResponse.dialogId)

  const readerChat = store.getSnapshotByToken(readerToken)?.chats.find((chat) => chat.id === readerDialogResponse.dialogId)
  const senderChat = store.getSnapshotByToken(senderToken)?.chats.find((chat) => chat.id === senderDialogResponse.dialogId)
  const senderMessage = senderChat?.messages.find((message) => message.text === 'secret read receipt')

  assert.equal(readerChat?.unread, 0)
  assert.equal(senderMessage?.readAt, undefined)
})

test('invisibility without premium still mirrors direct read receipts normally', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79990005043')
  const reader = createAccount('+79990005044', {
    invisibilityEnabled: true,
  })

  database.accounts.push(sender, reader)
  seedAcceptedContactLink(database, sender.identifier, reader.identifier)
  const senderToken = createSession(database, sender.identifier, 'sender-normal-read')
  const readerToken = createSession(database, reader.identifier, 'reader-normal-read')

  const senderDialogResponse = await store.openDirectDialog(senderToken, { identifier: reader.identifier })
  const readerDialogResponse = await store.openDirectDialog(readerToken, { identifier: sender.identifier })
  await store.sendDirectMessage(senderToken, senderDialogResponse.dialogId, { text: 'visible read receipt' })

  await store.markDialogRead(readerToken, readerDialogResponse.dialogId)

  const senderChat = store.getSnapshotByToken(senderToken)?.chats.find((chat) => chat.id === senderDialogResponse.dialogId)
  const senderMessage = senderChat?.messages.find((message) => message.text === 'visible read receipt')

  assert.ok(senderMessage?.readAt)
})

test('premium user with invisibility turned off still mirrors direct read receipts', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79990005047')
  const reader = createAccount('+79990005048', {
    invisibilityEnabled: false,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: true,
  })

  database.accounts.push(sender, reader)
  seedAcceptedContactLink(database, sender.identifier, reader.identifier)
  const senderToken = createSession(database, sender.identifier, 'sender-visible-premium-read')
  const readerToken = createSession(database, reader.identifier, 'reader-visible-premium-read')

  const senderDialogResponse = await store.openDirectDialog(senderToken, { identifier: reader.identifier })
  const readerDialogResponse = await store.openDirectDialog(readerToken, { identifier: sender.identifier })
  await store.sendDirectMessage(senderToken, senderDialogResponse.dialogId, { text: 'manual visible read receipt' })

  await store.markDialogRead(readerToken, readerDialogResponse.dialogId)

  const senderChat = store.getSnapshotByToken(senderToken)?.chats.find((chat) => chat.id === senderDialogResponse.dialogId)
  const senderMessage = senderChat?.messages.find((message) => message.text === 'manual visible read receipt')

  assert.ok(senderMessage?.readAt)
})

test('turning quiet on auto-enables invisibility for premium accounts', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+79990005045', {
    invisibilityEnabled: false,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: false,
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'quiet-auto-invisibility')

  await store.updateSession(token, {
    quietModeEnabled: true,
  })

  const snapshot = store.getSnapshotByToken(token)
  assert.equal(snapshot?.session.quietModeEnabled, true)
  assert.equal(snapshot?.session.invisibilityAutoEnabled, true)
  assert.equal(snapshot?.session.invisibilityEnabled, true)
})

test('turning quiet off clears invisibility only when quiet auto-enabled it', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+799900050451', {
    invisibilityAutoEnabled: true,
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: true,
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'quiet-auto-disable-invisibility')

  await store.updateSession(token, {
    quietModeEnabled: false,
  })

  const snapshot = store.getSnapshotByToken(token)
  assert.equal(snapshot?.session.quietModeEnabled, false)
  assert.equal(snapshot?.session.invisibilityAutoEnabled, false)
  assert.equal(snapshot?.session.invisibilityEnabled, false)
})

test('turning quiet off preserves manually enabled invisibility', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+799900050452', {
    invisibilityAutoEnabled: false,
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: true,
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'quiet-manual-invisibility')

  await store.updateSession(token, {
    quietModeEnabled: false,
  })

  const snapshot = store.getSnapshotByToken(token)
  assert.equal(snapshot?.session.quietModeEnabled, false)
  assert.equal(snapshot?.session.invisibilityAutoEnabled, false)
  assert.equal(snapshot?.session.invisibilityEnabled, true)
})

test('re-enabling quiet restores invisibility even after manual opt-out', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+79990005046', {
    invisibilityAutoEnabled: true,
    invisibilityEnabled: true,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: true,
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'quiet-restore-invisibility')

  await store.updateSession(token, {
    invisibilityEnabled: false,
  })
  assert.equal(store.getSnapshotByToken(token)?.session.invisibilityEnabled, false)

  await store.updateSession(token, {
    quietModeEnabled: false,
  })
  await store.updateSession(token, {
    quietModeEnabled: true,
  })

  const snapshot = store.getSnapshotByToken(token)
  assert.equal(snapshot?.session.quietModeEnabled, true)
  assert.equal(snapshot?.session.invisibilityAutoEnabled, true)
  assert.equal(snapshot?.session.invisibilityEnabled, true)
})

test('session snapshot normalizes quiet mode settings defaults', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79990005051')

  database.accounts.push(account)
  const token = createSession(database, account.identifier, 'quiet-defaults')

  const quietSettings = store.getSnapshotByToken(token)?.session.quietModeSettings
  assert.deepEqual(quietSettings, {
    autoInvisibility: true,
    channels: true,
    contactRequests: true,
    dialogs: true,
    groups: true,
    threads: true,
  })
})

test('turning quiet on respects autoInvisibility quiet setting when premium is active', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+79990005052', {
    invisibilityEnabled: false,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
    quietModeEnabled: false,
    quietModeSettings: {
      autoInvisibility: false,
      channels: true,
      contactRequests: true,
      dialogs: true,
      groups: true,
      threads: true,
    },
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'quiet-auto-disabled')

  await store.updateSession(token, {
    quietModeEnabled: true,
  })

  const snapshot = store.getSnapshotByToken(token)
  assert.equal(snapshot?.session.quietModeEnabled, true)
  assert.equal(snapshot?.session.invisibilityEnabled, false)

  await store.updateSession(token, {
    quietModeSettings: {
      autoInvisibility: true,
      channels: true,
      contactRequests: true,
      dialogs: true,
      groups: true,
      threads: true,
    },
    quietModeEnabled: false,
  })
  await store.updateSession(token, {
    quietModeEnabled: true,
  })

  const updatedSnapshot = store.getSnapshotByToken(token)
  assert.equal(updatedSnapshot?.session.invisibilityEnabled, true)
  assert.equal(updatedSnapshot?.session.quietModeSettings?.autoInvisibility, true)
})

test('session snapshot persists explicit invisibility preference updates', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+79990005049', {
    invisibilityAutoEnabled: true,
    invisibilityEnabled: false,
    premium: true,
    premiumExpiresAt: daysFromNow(10),
  })

  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'explicit-invisibility-persistence')

  await store.updateSession(token, {
    invisibilityEnabled: true,
  })
  assert.equal(store.getSnapshotByToken(token)?.session.invisibilityEnabled, true)
  assert.equal(store.getSnapshotByToken(token)?.session.invisibilityAutoEnabled, false)

  await store.updateSession(token, {
    invisibilityEnabled: false,
  })
  assert.equal(store.getSnapshotByToken(token)?.session.invisibilityEnabled, false)
  assert.equal(store.getSnapshotByToken(token)?.session.invisibilityAutoEnabled, false)
})

test('browser notifications preference persists server-side and defaults to enabled', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79990005053')

  database.accounts.push(account)
  const token = createSession(database, account.identifier, 'browser-notifications-preference')

  assert.equal(store.getSnapshotByToken(token)?.session.browserNotificationsEnabled, true)

  await store.updateSession(token, {
    browserNotificationsEnabled: false,
  })
  assert.equal(store.getSnapshotByToken(token)?.session.browserNotificationsEnabled, false)

  await store.updateSession(token, {
    browserNotificationsEnabled: true,
  })
  assert.equal(store.getSnapshotByToken(token)?.session.browserNotificationsEnabled, true)
})

test('self-unsubscribe syncs owner channel readers immediately', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006001')
  const subscriber = createAccount('+79990006002')

  database.accounts.push(owner, subscriber)
  const ownerToken = createSession(database, owner.identifier, 'owner')
  const subscriberToken = createSession(database, subscriber.identifier, 'subscriber')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@unsubscribe-check',
    statusText: 'Статус канала',
    title: 'Проверка отписки',
    visibility: 'private',
  })

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  const subscribeResponse = await store.subscribeToChannelByHandle(subscriberToken, '@unsubscribe-check')
  const ownerChannelBefore = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@unsubscribe-check',
  )
  assert.equal(ownerChannelBefore?.readers, 2)

  await store.deleteSubscriptionChannel(subscriberToken, subscribeResponse.channelId)

  const ownerChannelAfter = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@unsubscribe-check',
  )
  assert.equal(ownerChannelAfter?.readers, 1)
  assert.equal(ownerChannelAfter?.participants?.length, 1)
})

test('legacy managed channel without owner copy self-repairs on subscribe', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006011')
  const subscriber = createAccount('+79990006012')

  database.accounts.push(owner, subscriber)
  const ownerToken = createSession(database, owner.identifier, 'legacy-owner')
  const subscriberToken = createSession(database, subscriber.identifier, 'legacy-subscriber')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@legacy-owner-copy',
    statusText: 'Проверка legacy owner copy',
    title: 'Legacy owner copy',
    visibility: 'private',
  })

  database.subscriptionChannels = database.subscriptionChannels.filter(
    (channel) =>
      !(
        channel.ownerIdentifier === owner.identifier &&
        channel.handle === '@legacy-owner-copy'
      ),
  )
  database.subscriptionPosts = database.subscriptionPosts.filter(
    (post) => !(post.ownerIdentifier === owner.identifier),
  )

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  await store.subscribeToChannelByHandle(subscriberToken, '@legacy-owner-copy')

  const repairedOwnerCopy = database.subscriptionChannels.find(
    (channel) =>
      channel.ownerIdentifier === owner.identifier &&
      channel.handle === '@legacy-owner-copy',
  )
  assert.ok(repairedOwnerCopy)

  const ownerChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@legacy-owner-copy',
  )
  assert.equal(ownerChannel?.readers, 2)
  assert.equal(
    ownerChannel?.participants?.some((participant) => participant.identifier === subscriber.identifier),
    true,
  )
})

test('stale owner subscription participants repair on subscribe', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006021')
  const subscriber = createAccount('+79990006022')

  database.accounts.push(owner, subscriber)
  const ownerToken = createSession(database, owner.identifier, 'stale-owner')
  const subscriberToken = createSession(database, subscriber.identifier, 'stale-subscriber')

  const dialogResponse = await store.openDirectDialog(ownerToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@stale-owner-participants',
    statusText: 'Проверка stale participants',
    title: 'Stale participants',
    visibility: 'private',
  })

  const ownerCopyBefore = database.subscriptionChannels.find(
    (channel) =>
      channel.ownerIdentifier === owner.identifier &&
      channel.handle === '@stale-owner-participants',
  )
  assert.ok(ownerCopyBefore)
  ownerCopyBefore!.participants = [{
    accent: '#8c5738',
    archivedAccount: false,
    favorite: false,
    id: 1,
    identifier: owner.identifier,
    nickname: '',
    online: true,
    premium: false,
    status: '',
    title: owner.displayName,
  }]
  ownerCopyBefore!.readers = 1

  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [dialogResponse.dialogId],
  })
  await store.subscribeToChannelByHandle(subscriberToken, '@stale-owner-participants')

  const ownerCopyAfter = database.subscriptionChannels.find(
    (channel) =>
      channel.ownerIdentifier === owner.identifier &&
      channel.handle === '@stale-owner-participants',
  )
  assert.equal(ownerCopyAfter?.participants?.length, 2)

  const ownerChannel = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@stale-owner-participants',
  )
  assert.equal(ownerChannel?.readers, 2)
  assert.equal(ownerChannel?.participants?.length, 2)
  assert.equal(
    ownerChannel?.participants?.some((participant) => participant.identifier === subscriber.identifier),
    true,
  )
})

test('channel transfer reassigns ownership without deleting channel for everyone', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006031', {
    passwordHash: await hashPassword('1111'),
  })
  const nextOwner = createAccount('+79990006032')
  const subscriber = createAccount('+79990006033')

  database.accounts.push(owner, nextOwner, subscriber)
  const ownerToken = createSession(database, owner.identifier, 'transfer-owner')
  const nextOwnerToken = createSession(database, nextOwner.identifier, 'transfer-next-owner')
  const subscriberToken = createSession(database, subscriber.identifier, 'transfer-subscriber')

  const subscriberDialog = await store.openDirectDialog(ownerToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@transfer-keeps-channel',
    statusText: 'Канал не должен исчезать',
    title: 'Безопасная передача канала',
    visibility: 'private',
  })

  await store.sendManagedChannelPost(ownerToken, createdChannel.channelId, {
    text: 'История канала должна сохраниться',
  })
  await store.inviteManagedChannelMembers(ownerToken, createdChannel.channelId, {
    dialogIds: [subscriberDialog.dialogId],
  })
  await store.subscribeToChannelByHandle(subscriberToken, '@transfer-keeps-channel')

  await store.transferManagedChannel(ownerToken, createdChannel.channelId, {
    currentPassword: '1111',
    identifier: nextOwner.identifier,
  })

  const transferredChannel = database.managedChannels.find(
    (channel) => channel.directLink === '@transfer-keeps-channel',
  )
  assert.equal(transferredChannel?.ownerIdentifier, nextOwner.identifier)

  const ownerManagedChannel = store.getSnapshotByToken(ownerToken)?.channels.find(
    (channel) => channel.directLink === '@transfer-keeps-channel',
  )
  assert.equal(ownerManagedChannel, undefined)

  const nextOwnerManagedChannel = store.getSnapshotByToken(nextOwnerToken)?.channels.find(
    (channel) => channel.directLink === '@transfer-keeps-channel',
  )
  assert.ok(nextOwnerManagedChannel)

  const ownerSubscriptionCopy = store.getSnapshotByToken(ownerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@transfer-keeps-channel',
  )
  const nextOwnerSubscriptionCopy = store.getSnapshotByToken(nextOwnerToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@transfer-keeps-channel',
  )
  const subscriberSubscriptionCopy = store.getSnapshotByToken(subscriberToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@transfer-keeps-channel',
  )

  assert.ok(ownerSubscriptionCopy)
  assert.ok(nextOwnerSubscriptionCopy)
  assert.ok(subscriberSubscriptionCopy)
  assert.equal(subscriberSubscriptionCopy?.posts.length, 2)
  assert.equal(nextOwnerSubscriptionCopy?.readers, 3)
  assert.equal(nextOwnerSubscriptionCopy?.participants?.length, 3)
})

test('channel transfer requires the current owner password', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const owner = createAccount('+79990006041', {
    passwordHash: await hashPassword('1111'),
  })
  const nextOwner = createAccount('+79990006042')

  database.accounts.push(owner, nextOwner)
  const ownerToken = createSession(database, owner.identifier, 'transfer-owner-password')

  const createdChannel = await store.createManagedChannel(ownerToken, {
    avatarTone: '#8c5738',
    directLink: '@transfer-password-check',
    statusText: 'Требует пароль',
    title: 'Передача по паролю',
    visibility: 'private',
  })

  await assert.rejects(
    () =>
      store.transferManagedChannel(ownerToken, createdChannel.channelId, {
        currentPassword: '0000',
        identifier: nextOwner.identifier,
      }),
    /Неверный пароль/u,
  )

  const unchangedChannel = database.managedChannels.find(
    (channel) => channel.directLink === '@transfer-password-check',
  )
  assert.equal(unchangedChannel?.ownerIdentifier, owner.identifier)
})

test('premium repeat purchase extends current active term', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const account = createAccount('+79990007001', {
    premium: true,
    premiumExpiresAt: daysFromNow(10),
  })
  const staff = createAccount('+79990007002', { staffRole: 'owner' })

  database.accounts.push(account, staff)
  const accountToken = createSession(database, account.identifier, 'premium-user')
  const staffToken = createSession(database, staff.identifier, 'premium-staff')
  const previousExpiry = Date.parse(account.premiumExpiresAt!)

  await store.setDebugPremiumState(accountToken, {
    durationDays: 30,
    enabled: true,
  })
  const extendedByDebug = Date.parse(account.premiumExpiresAt!)
  assert.ok(extendedByDebug >= previousExpiry + 29 * 24 * 60 * 60 * 1000)

  const beforeAdminGrant = Date.parse(account.premiumExpiresAt!)
  await store.adminSetUserPremium(staffToken, account.identifier, {
    durationDays: 30,
    enabled: true,
    reason: 'regression-check',
  })
  const extendedByAdmin = Date.parse(account.premiumExpiresAt!)
  assert.ok(extendedByAdmin >= beforeAdminGrant + 29 * 24 * 60 * 60 * 1000)
})

test('exact contact handles materialize into contact cards across message surfaces', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sender = createAccount('+79990008001')
  const recipient = createAccount('+79990008002')
  const contact = createAccount('+79990008003', {
    avatarImage: 'uploads/avatars/contact-card.png',
  })

  contact.displayName = 'Иван'
  contact.surname = 'Петров'
  contact.nickname = 'ivan_petrov'
  contact.status = 'Главный по статусу'

  database.accounts.push(sender, recipient, contact)
  const senderToken = createSession(database, sender.identifier, 'contact-card-sender')
  const recipientToken = createSession(database, recipient.identifier, 'contact-card-recipient')
  seedAcceptedContactLink(database, sender.identifier, recipient.identifier)

  const dialogResponse = await store.openDirectDialog(senderToken, { identifier: recipient.identifier })
  await store.sendDirectMessage(senderToken, dialogResponse.dialogId, {
    text: '@ivan_petrov',
  })

  const recipientDialog = store.getSnapshotByToken(recipientToken)?.chats.find(
    (chat) => chat.phone === sender.identifier,
  )
  const directMessage = recipientDialog?.messages.at(-1)
  assert.equal(directMessage?.sourceContact?.identifier, contact.identifier)
  assert.equal(directMessage?.sourceContact?.title, 'Иван Петров')
  assert.equal(directMessage?.sourceContact?.status, 'Главный по статусу')
  assert.equal(directMessage?.sourceContact?.handle, '@ivan_petrov')
  assert.equal(directMessage?.sourceContact?.avatarImage, 'uploads/avatars/contact-card.png')

  const createdGroup = await store.createGroup(senderToken, {
    memberDialogIds: [dialogResponse.dialogId],
    title: 'Группа с контактами',
  })
  await store.updateGroup(senderToken, createdGroup.groupId, {
    commentsEnabledForAll: true,
    commentsEnabledForPremium: false,
  })
  await store.sendGroupMessage(senderToken, createdGroup.groupId, {
    text: '@ivan_petrov',
  })

  const senderGroup = store.getSnapshotByToken(senderToken)?.groups.find(
    (group) => group.id === createdGroup.groupId,
  )
  const groupMessage = senderGroup?.messages.at(-1)
  assert.equal(groupMessage?.sourceContact?.identifier, contact.identifier)

  const createdChannel = await store.createManagedChannel(senderToken, {
    avatarTone: '#8c5738',
    directLink: '@contact-card-channel',
    statusText: 'Канал для теста контакта',
    title: 'Канал с контактами',
    visibility: 'private',
  })
  await store.sendManagedChannelPost(senderToken, createdChannel.channelId, {
    text: '@ivan_petrov',
  })

  const senderChannel = store.getSnapshotByToken(senderToken)?.subscriptionChannels.find(
    (channel) => channel.handle === '@contact-card-channel',
  )
  const channelPost = senderChannel?.posts.at(-1)
  assert.equal(channelPost?.sourceContact?.identifier, contact.identifier)

  const persistedGroupMessage = database.groupMessages.find(
    (message) =>
      message.ownerIdentifier === sender.identifier &&
      message.groupId === createdGroup.groupId &&
      message.text === '@ivan_petrov',
  )
  assert.ok(persistedGroupMessage)

  await store.sendGroupThreadComment(senderToken, createdGroup.groupId, persistedGroupMessage!.id, {
    text: '@ivan_petrov',
  })

  const senderGroupAfterThread = store.getSnapshotByToken(senderToken)?.groups.find(
    (group) => group.id === createdGroup.groupId,
  )
  const threadedMessage = senderGroupAfterThread?.messages.find(
    (message) => message.id === persistedGroupMessage?.id,
  )
  const threadComment = threadedMessage?.threadComments?.at(-1)
  assert.equal(threadComment?.sourceContact?.identifier, contact.identifier)
})

test('explicit shared contact cards preserve signature text in direct messages', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const sharer = createAccount('+79990008011')
  const recipient = createAccount('+79990008012')
  const sharedContact = createAccount('+79990008013', {
    avatarImage: 'uploads/avatars/shared-contact.png',
  })

  sharedContact.displayName = 'Мария'
  sharedContact.surname = 'Иванова'
  sharedContact.nickname = 'maria_ivanova'
  sharedContact.status = 'Надёжный контакт'

  database.accounts.push(sharer, recipient, sharedContact)
  const sharerToken = createSession(database, sharer.identifier, 'contact-share-sender')
  const recipientToken = createSession(database, recipient.identifier, 'contact-share-recipient')
  seedAcceptedContactLink(database, sharer.identifier, recipient.identifier)

  const dialogResponse = await store.openDirectDialog(sharerToken, { identifier: recipient.identifier })
  await store.sendDirectMessage(sharerToken, dialogResponse.dialogId, {
    sourceContact: {
      handle: '@maria_ivanova',
      identifier: sharedContact.identifier,
      status: 'Надёжный контакт',
      title: 'Мария Иванова',
    },
    text: 'Пишу тебе этот контакт, потому что он поможет.',
  })

  const recipientDialog = store.getSnapshotByToken(recipientToken)?.chats.find(
    (chat) => chat.phone === sharer.identifier,
  )
  const directMessage = recipientDialog?.messages.at(-1)
  assert.equal(directMessage?.sourceContact?.identifier, sharedContact.identifier)
  assert.equal(directMessage?.sourceContact?.title, 'Мария Иванова')
  assert.equal(directMessage?.text, 'Пишу тебе этот контакт, потому что он поможет.')
})

test('quiet toggle icon contract matches visual states', () => {
  assert.equal(quietToggleIcons.default, '/icons/quiet100.png')
  assert.equal(quietToggleIcons.active, '/icons/quiet.png')
  assert.equal(getQuietToggleIconPath(false), '/icons/quiet100.png')
  assert.equal(getQuietToggleIconPath(true), '/icons/quiet.png')
})

test('bottom channels action icon contract matches premium state', () => {
  assert.equal(bottomChannelsActionIcons.premiumDisabled, '/icons/crown64.png')
  assert.equal(bottomChannelsActionIcons.premiumEnabled, '/icons/news_settings.png')
  assert.equal(getBottomChannelsActionIconPath(false), '/icons/crown64.png')
  assert.equal(getBottomChannelsActionIconPath(true), '/icons/news_settings.png')
})

test('icon asset contract is documented in code and staging docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const iconContractsSource = readFileSync(join(repoRoot, 'src', 'app', 'iconContracts.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(iconContractsSource, /must stay world-readable/u)
  assert.match(iconContractsSource, /Private perms like 0600 break staging/u)
  assert.match(handoffDoc, /public\/icons\/\*/, 'handoff must mention public icon contract')
  assert.match(handoffDoc, /world-readable/u)
  assert.match(rolloutDoc, /проверять права на исходный asset/u)
  assert.match(rolloutDoc, /broken image/u)
})

test('channels list view copy contract matches current UX', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const listViewStart = appSource.indexOf('{isChannelsListView ? (')
  const listViewEnd = appSource.indexOf('{isChannelCreateView ? (')

  assert.ok(listViewStart >= 0)
  assert.ok(listViewEnd > listViewStart)

  const listViewSource = appSource.slice(listViewStart, listViewEnd)
  assert.match(listViewSource, /<h2>Управление каналами<\/h2>/u)
  assert.doesNotMatch(listViewSource, /<p className="eyebrow">Каналы<\/p>/u)
  assert.match(listViewSource, /Пока нет каналов\. Создайте свой первый канал\./u)
  assert.doesNotMatch(listViewSource, /Создайте первый канал из этой сцены\./u)
  assert.doesNotMatch(listViewSource, /<article className="settings-item">[\s\S]*Пока нет каналов/u)
})

test('channel management popup keeps cards dark and titles readable in dark theme', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.settings-item,\s*[\s\S]*html\[data-theme='dark'\] \.channel-card,\s*[\s\S]*background:\s*rgba\(36,\s*37,\s*43,\s*0\.94\);[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*color:\s*var\(--ink\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.channel-card-title > span:first-child\s*\{[\s\S]*color:\s*var\(--ink\);/u,
  )
})

test('channel transfer UI is hidden while backend transfer stays dark-launched', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.doesNotMatch(appSource, /Подтвердите передачу канала/u)
  assert.doesNotMatch(appSource, /Кому передать этот канал\?/u)
  assert.doesNotMatch(appSource, /startChannelTransfer\(activeChannel\.id\)/u)
})

test('ghost avatar icon uses white tint contract for deleted entities', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appCss,
    /\.avatar-ghost-icon\s*\{[\s\S]*filter:\s*brightness\(0\)\s*invert\(1\);/u,
  )
})

test('direct room favorite star uses dark default tint and light active tint', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appCss,
    /\.room-star img\s*\{[\s\S]*filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(22%\)/u,
  )
  assert.match(
    appCss,
    /\.room-star\.active img\s*\{[\s\S]*filter:\s*brightness\(0\)\s*saturate\(100%\)\s*invert\(98%\)/u,
  )
})

test('media-only bubbles use shared row shell and side action area contract', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const mediaRowSource = readFileSync(
    join(repoRoot, 'src', 'components', 'MediaOnlyBubbleRow.tsx'),
    'utf8',
  )
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(
    join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'),
    'utf8',
  )
  const threadSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(mediaRowSource, /className="media-bubble-row-action"/u)
  assert.match(directRoomSource, /<MediaOnlyBubbleRow/u)
  assert.match(groupRoomSource, /<MediaOnlyBubbleRow/u)
  assert.match(groupRoomSource, /function renderGroupMediaAuthor/u)
  assert.match(groupRoomSource, /className="bubble-media-header bubble-media-header-button"/u)
  assert.match(channelRoomSource, /<MediaOnlyBubbleRow/u)
  assert.match(threadSource, /<MediaOnlyBubbleRow/u)
})

test('group media bubbles keep a compact author header in both room and selected overlay', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(groupRoomSource, /renderGroupMediaAuthor/u)
  assert.match(groupRoomSource, /className="bubble-media-header bubble-media-header-button"/u)
  assert.match(groupRoomSource, /className="bubble-media-header bubble-media-header-button"/u)
  assert.match(groupRoomSource, /onMessageSelect\(event\.currentTarget, message\)/u)
  assert.match(overlaySource, /renderGroupOverlayAuthor/u)
  assert.match(overlaySource, /className="bubble-media-header"/u)
  assert.match(
    overlaySource,
    /composerSelectors = \['\.composer', '\.composer-disabled', '\.settings-support-composer', '\.channel-room-footer'\]/u,
  )
  assert.match(overlaySource, /rect\.top - 8/u)
  assert.match(overlaySource, /safeBottom - boundedHeight/u)
  assert.match(appCss, /\.bubble\.media-only-bubble \.bubble-media-header/u)
  assert.match(appCss, /\.bubble\.media-only-bubble \.bubble-media-header-button/u)
  assert.match(appCss, /\.bubble\.media-only-bubble\.mine \.bubble-media-header/u)
  assert.match(appCss, /\.bubble\.media-only-bubble \.bubble-media-header \{[\s\S]*padding:\s*8px 14px;/u)
})

test('standard group text bubbles render the author strip above the bubble instead of inside it', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(groupRoomSource, /shouldRenderIncomingAuthorStrip/u)
  assert.match(groupRoomSource, /shouldUseAuthorChainBreakSpacing/u)
  assert.match(groupRoomSource, /const previousMessageInChain =/u)
  assert.match(groupRoomSource, /const shouldRenderGroupAuthorStrip = shouldRenderIncomingAuthorStrip\(/u)
  assert.match(groupRoomSource, /const groupMessageRowClassName = shouldUseGroupAuthorBreakSpacing/u)
  assert.match(groupRoomSource, /const shouldRenderExternalGroupAuthor =/u)
  assert.match(
    groupRoomSource,
    /const groupMediaAuthor = shouldRenderGroupAuthorStrip[\s\S]*renderGroupMediaAuthor\(message, groupParticipant\)/u,
  )
  assert.match(groupRoomSource, /Boolean\(groupMediaAuthor\) && !isImageOnlyBubble && !isGroupCaptionedImageBubble/u)
  assert.match(groupRoomSource, /const messageBubbleButton = \(/u)
  assert.match(groupRoomSource, /return shouldRenderExternalGroupAuthor \? \(/u)
  assert.match(groupRoomSource, /<div className="bubble-author-layout">/u)
  assert.match(groupRoomSource, /className="bubble-author-strip"/u)
  assert.match(groupRoomSource, /<div className=\{groupMessageRowClassName\}>/u)
  assert.match(groupRoomSource, /data-bubble-measure=\{shouldRenderExternalGroupAuthor \? 'true' : undefined\}/u)
  assert.match(overlaySource, /const shouldRenderExternalGroupAuthor =/u)
  assert.match(overlaySource, /className="bubble-author-layout bubble-overlay-author-layout"/u)
  assert.match(appCss, /\.bubble-author-layout/u)
  assert.match(appCss, /\.group-room-feed \.bubble-author-layout,\s*\.room-thread-feed \.bubble-author-layout \{/u)
  assert.match(appCss, /gap:\s*3px;/u)
  assert.match(appCss, /padding-top:\s*0;/u)
  assert.match(appCss, /\.bubble-author-strip \{[\s\S]*padding:\s*0;/u)
  assert.match(appCss, /\.bubble-sender \{[\s\S]*align-items:\s*flex-end;/u)
  assert.match(appCss, /\.bubble-sender-name \{[\s\S]*line-height:\s*1;/u)
  assert.match(appCss, /\.bubble-sender-crown \{[\s\S]*align-items:\s*flex-end;/u)
  assert.match(appCss, /\.bubble-overlay-author-layout/u)
})

test('selected message overlays anchor to the full author-strip layout and can nudge the feed instead of drifting', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const anchoredMenuSource = readFileSync(join(repoRoot, 'src', 'app', 'useAnchoredMenu.ts'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(anchoredMenuSource, /function getActionAnchorRoot\(element: HTMLElement\)/u)
  assert.match(anchoredMenuSource, /element\.closest<HTMLElement>\('\.bubble-author-layout'\) \?\? element/u)
  assert.match(anchoredMenuSource, /function getActionAnchorMeasureElement/u)
  assert.match(anchoredMenuSource, /\[data-bubble-measure="true"\]/u)
  assert.match(anchoredMenuSource, /top: rect\.top,/u)
  assert.match(anchoredMenuSource, /left: measureRect\.left,/u)
  assert.match(anchoredMenuSource, /width: measureRect\.width,/u)
  assert.match(anchoredMenuSource, /function getDesiredActionOverlayTop\(anchor: ActionAnchor\)/u)
  assert.match(anchoredMenuSource, /const scrollContainer = element\.closest<HTMLElement>\('\.message-feed'\)/u)
  assert.match(anchoredMenuSource, /scrollContainer\.scrollTop \+= scrollDelta/u)
  assert.match(anchoredMenuSource, /setAnchor\(getActionAnchor\(element, align\)\)/u)
  assert.match(appCss, /\.bubble-author-layout\.bubble-overlay-author-layout \{[\s\S]*gap:\s*3px;/u)
})

test('group captioned media bubbles keep a dedicated author-safe layout in room and selected overlay', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(groupRoomSource, /const isGroupCaptionedImageBubble =/u)
  assert.match(groupRoomSource, /const hasGroupCaptionedMediaHeader = isGroupCaptionedImageBubble && Boolean\(groupMediaAuthor\)/u)
  assert.match(groupRoomSource, /bubbleClassNames\.push\('group-captioned-media-bubble'\)/u)
  assert.match(groupRoomSource, /bubbleClassNames\.push\('group-captioned-media-bubble-with-header'\)/u)
  assert.match(groupRoomSource, /className="bubble-media-header bubble-media-header-captioned"/u)
  assert.match(overlaySource, /const isGroupCaptionedImageBubble =/u)
  assert.match(overlaySource, /const hasGroupCaptionedMediaHeader = isGroupCaptionedImageBubble && Boolean\(groupOverlayAuthorNode\)/u)
  assert.match(overlaySource, /bubbleClassNames\.push\('group-captioned-media-bubble'\)/u)
  assert.match(overlaySource, /bubbleClassNames\.push\('group-captioned-media-bubble-with-header'\)/u)
  assert.match(overlaySource, /className="bubble-media-header bubble-media-header-captioned"/u)
  assert.match(appCss, /\.bubble\.group-captioned-media-bubble \.bubble-media-header/u)
  assert.match(
    appCss,
    /\.bubble\.group-captioned-media-bubble \.bubble-media-header \{[\s\S]*padding:\s*0 0 8px;/u,
  )
  assert.match(
    appCss,
    /\.group-room-feed \.bubble\.group-captioned-media-bubble,\s*\.room-thread-feed \.bubble\.group-captioned-media-bubble,\s*\.bubble-overlay\.group-captioned-media-bubble \{\s*padding-top:\s*12px;/u,
  )
  assert.match(
    appCss,
    /\.bubble\.group-captioned-media-bubble-with-header \.bubble-attachment-photo\.has-body-below \{\s*margin:\s*0 -18px 12px;/u,
  )
  assert.match(
    appCss,
    /\.bubble\.group-captioned-media-bubble-with-header \.bubble-attachment-photo\.has-body-below \.bubble-attachment-image \{\s*border-top-left-radius:\s*0;/u,
  )
  assert.match(appCss, /border-top-right-radius:\s*0;/u)
  assert.doesNotMatch(
    appCss,
    /\.bubble\.group-captioned-media-bubble \.bubble-attachment-photo\.has-body-below \{\s*margin:\s*0 -18px 12px;/u,
  )
})

test('threaded media bubbles keep the image flush with the comments pill without restored bottom rounding', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appCss,
    /\.threaded-bubble\.has-thread \.threaded-bubble-main > \.bubble\.media-only-bubble[\s\S]*border-bottom-left-radius:\s*0/u,
  )
  assert.match(
    appCss,
    /\.media-bubble-row[\s\S]*>\s*\.bubble\.media-only-bubble[\s\S]*border-bottom-right-radius:\s*0/u,
  )
  assert.match(
    appCss,
    /generic \.bubble\.mine rule lands later[\s\S]*reintroduce bottom rounding/u,
  )
})

test('direct, group and thread feeds keep compact bubble spacing while channel posts stay roomier', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(directRoomSource, /className="message-feed direct-room-feed"/u)
  assert.match(groupRoomSource, /function renderGroupMediaAuthor[\s\S]*if \(message\.author === 'me'\) \{\s*return null/u)
  assert.doesNotMatch(
    groupRoomSource,
    /function renderGroupMediaAuthor[\s\S]*return <span className="bubble-meta">Вы<\/span>/u,
  )
  assert.match(
    groupRoomSource,
    /const groupMediaAuthor = shouldRenderGroupAuthorStrip[\s\S]*renderGroupMediaAuthor\(message, groupParticipant\)/u,
  )
  assert.match(groupRoomSource, /groupMediaAuthor \? \(\s*<button[\s\S]*bubble-media-header bubble-media-header-button/u)
  assert.match(groupRoomSource, /isGroupCaptionedImageBubble && groupMediaAuthor/u)
  assert.match(groupRoomSource, /className="message-feed group-room-feed"/u)
  assert.match(groupRoomSource, /group-message-row group-message-row-author-break/u)
  assert.match(channelRoomSource, /className="message-feed"/u)
  assert.doesNotMatch(channelRoomSource, /className="message-feed direct-room-feed"/u)
  assert.match(appSource, /const shouldRenderCommentAuthorNode = shouldRenderIncomingAuthorStrip\(/u)
  assert.match(appSource, /const threadCommentRowClassName = shouldUseCommentAuthorBreakSpacing/u)
  assert.match(appSource, /const commentAuthorNode =[\s\S]*renderThreadAuthorNode\(participant, comment\.displayAuthor \?\? 'Участник'\)/u)
  assert.match(appSource, /\{commentAuthorNode\}/u)
  assert.match(appSource, /className=\{threadCommentRowClassName\}/u)
  assert.match(overlaySource, /function renderGroupOverlayAuthor[\s\S]*if \(mine\) \{\s*return null/u)
  assert.doesNotMatch(
    overlaySource,
    /function renderGroupOverlayAuthor[\s\S]*return <span className="bubble-meta">Вы<\/span>/u,
  )
  assert.match(appSource, /const shouldRenderExternalCommentAuthor = Boolean\(commentAuthorNode\) && !isImageOnlyBubble/u)
  assert.match(appSource, /data-bubble-measure=\{shouldRenderExternalCommentAuthor \? 'true' : undefined\}/u)
  assert.match(
    appSource,
    /return shouldRenderExternalCommentAuthor \? \(\s*<div className="bubble-author-layout">\s*<div className="bubble-author-strip">\{commentAuthorNode\}<\/div>\s*\{threadCommentBubbleButton\}/u,
  )
  assert.match(
    overlaySource,
    /const shouldRenderExternalAuthor = Boolean\(authorNode\) && !isImageOnlyBubble/u,
  )
  assert.match(
    overlaySource,
    /return shouldRenderExternalAuthor \? \(\s*<div\s*className="bubble-author-layout bubble-overlay-author-layout"/u,
  )
  assert.match(overlaySource, /const compactOverlayClassName = ' bubble-overlay-compact'/u)
  assert.match(overlaySource, /bubbleClassNames\.push\('bubble-overlay-compact'\)/u)
  assert.match(appCss, /\.direct-room-feed,\s*\.group-room-feed,\s*\.room-thread-feed \{\s*gap: 3px;/u)
  assert.doesNotMatch(
    appCss,
    /\.direct-room-feed,\s*\.group-room-feed,\s*\.room-thread-feed \{[^}]*justify-content:\s*flex-end;/u,
  )
  assert.match(
    appCss,
    /Cross-browser scroll invariant:[\s\S]*older history above the scroll origin unreachable/u,
  )
  assert.match(
    appCss,
    /\.direct-room-feed > :first-child,\s*\.group-room-feed > :first-child,\s*\.room-thread-feed > :first-child \{\s*margin-top: auto;/u,
  )
  assert.match(appCss, /\.group-message-row-author-break,\s*\.thread-comment-row-author-break \{\s*margin-top: 9px;/u)
  assert.match(appCss, /\.group-room-feed \.bubble-author-layout,\s*\.room-thread-feed \.bubble-author-layout \{\s*gap: 3px;\s*padding-top: 0;/u)
  assert.match(
    appCss,
    /\.bubble \{\s*max-width: min\(520px, 78%\);\s*padding: 11px 18px 9px;/u,
  )
  assert.match(
    appCss,
    /\.group-room-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\),\s*\.room-thread-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \{\s*padding-top: 12px;\s*padding-bottom: 10px;/u,
  )
  assert.match(
    appCss,
    /\.group-room-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) time,\s*\.room-thread-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) time \{\s*margin-top: 5px;/u,
  )
  assert.match(
    appCss,
    /\.group-room-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-delivery-indicator,\s*\.room-thread-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-delivery-indicator \{\s*bottom: 10px;/u,
  )
  assert.match(appCss, /\.room-thread-feed > \.thread-comment-row:first-child \{\s*margin-top: 12px;/u)
  assert.match(
    appCss,
    /\.bubble-overlay\.bubble-overlay-compact:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \{\s*padding-top: 10px;\s*padding-bottom: 8px;/u,
  )
  assert.match(
    appCss,
    /\.bubble-overlay\.bubble-overlay-compact:not\(\.media-only-bubble\):not\(\.emoji-only-message\) time \{\s*margin-top: 5px;/u,
  )
  assert.match(
    appCss,
    /\.bubble-overlay\.bubble-overlay-compact:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-delivery-indicator \{\s*bottom: 10px;/u,
  )
  assert.match(appCss, /\.threaded-bubble\.has-thread \.threaded-bubble-main > \.bubble-author-layout > \.bubble,/u)
  assert.match(
    appCss,
    /\.threaded-bubble\.has-thread[\s\S]*> \.bubble-stack[\s\S]*> \.bubble-author-layout[\s\S]*border-bottom-right-radius: 0;/u,
  )
})

test('text bubbles use inline meta so time does not force a separate footer row', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(bubbleSource, /export function BubbleTextInlineMeta/u)
  assert.match(bubbleSource, /className="bubble-text-paragraph-with-inline-meta"/u)
  assert.match(bubbleSource, /className="bubble-text-content"/u)
  assert.match(directRoomSource, /const renderedMessageTime = formatMessageTimeLabel\(message\.createdAt, message\.time\)/u)
  assert.match(directRoomSource, /const shouldUseInlineTextMeta =/u)
  assert.match(directRoomSource, /<BubbleTextInlineMeta/u)
  assert.match(directRoomSource, /time=\{renderedMessageTime\}/u)
  assert.match(directRoomSource, /!hasImageAttachment && !shouldUseInlineTextMeta \? <time>\{renderedMessageTime\}<\/time> : null/u)
  assert.doesNotMatch(directRoomSource, /<time>\{message\.time\}<\/time>/u)
  assert.match(groupRoomSource, /const renderedMessageTime = formatMessageTimeLabel\(message\.createdAt, message\.time\)/u)
  assert.match(groupRoomSource, /const shouldUseInlineTextMeta =/u)
  assert.match(groupRoomSource, /<BubbleTextInlineMeta/u)
  assert.match(groupRoomSource, /time=\{renderedMessageTime\}/u)
  assert.match(groupRoomSource, /!hasImageAttachment && !shouldUseInlineTextMeta \? \(\s*<time>\{renderedMessageTime\}<\/time>/u)
  assert.doesNotMatch(groupRoomSource, /<time>\{message\.time\}<\/time>/u)
  assert.match(channelRoomSource, /const renderedPostTime = formatMessageTimeLabel\(post\.createdAt, post\.time\)/u)
  assert.match(
    channelRoomSource,
    /const shouldUseInlineTextMeta =\s*!hasImageAttachment && \(post\.text\.trim\(\)\.length > 0 \|\| Boolean\(post\.attachment\)\)/u,
  )
  assert.ok(
    (
      channelRoomSource.match(
        /<BubbleTextInlineMeta\s+edited=\{Boolean\(post\.editedAt\)\}\s+time=\{renderedPostTime\}\s*\/>/gu,
      ) ?? []
    ).length >= 2,
  )
  assert.match(channelRoomSource, /!hasImageAttachment && !shouldUseInlineTextMeta \? <time>\{renderedPostTime\}<\/time> : null/u)
  assert.doesNotMatch(channelRoomSource, /<time>\{post\.time\}<\/time>/u)
  assert.match(
    appSource,
    /const shouldUseInlineTextMeta =\s*!hasImageAttachment &&\s*\(comment\.text\.trim\(\)\.length > 0 \|\| Boolean\(comment\.attachment\)\)/u,
  )
  assert.match(
    appSource,
    /<BubbleTextInlineMeta\s+edited=\{Boolean\(comment\.editedAt\)\}\s+time=\{threadCommentTime\}\s*\/>/u,
  )
  assert.ok((appSource.match(/time=\{threadSourceTime\}/gu) ?? []).length >= 3)
  assert.match(appSource, /!usesInlineTimeLayout && \(!hasImageAttachment \|\| usesCaptionedImageCardLayout \|\| usesImageOnlyCardLayout\) \? \(\s*<time>\{threadSourceTime\}<\/time>/u)
  assert.match(
    overlaySource,
    /const renderedPostTime = formatMessageTimeLabel\(props\.post\.createdAt, props\.post\.time\)/u,
  )
  assert.match(
    overlaySource,
    /const shouldUseInlineTextMeta =\s*!hasImageAttachment && \(props\.post\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.post\.attachment\)\)/u,
  )
  assert.match(
    overlaySource,
    /const renderedCommentTime = formatMessageTimeLabel\(props\.comment\.createdAt, props\.comment\.time\)/u,
  )
  assert.match(
    overlaySource,
    /const shouldUseInlineTextMeta =\s*!hasImageAttachment &&\s*\(props\.comment\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.comment\.attachment\)\)/u,
  )
  assert.match(
    overlaySource,
    /const renderedMessageTime = formatMessageTimeLabel\(props\.message\.createdAt, props\.message\.time\)/u,
  )
  assert.match(
    overlaySource,
    /const shouldUseInlineTextMeta =\s*!hasImageAttachment &&\s*!isStandaloneEmojiOnlyMessage &&\s*!showDeliveryCaption &&\s*\(props\.message\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.message\.attachment\)\)/u,
  )
  assert.doesNotMatch(overlaySource, /<time>\{props\.(?:message|post|comment)\.time\}<\/time>/u)
  assert.match(appCss, /\.bubble-text-paragraph-with-inline-meta \{\s*position: relative;\s*padding-right: 44px;\s*min-height: 14px;/u)
  assert.match(appCss, /\.bubble-text-paragraph-with-inline-meta:has\(\.bubble-text-inline-meta-stacked\) \{\s*display: grid;\s*gap: 4px;\s*padding-right: 0;\s*min-height: 0;/u)
  assert.match(appCss, /\.bubble\.has-delivery-indicator \.bubble-text-paragraph-with-inline-meta \{\s*padding-right: 64px;/u)
  assert.match(appCss, /\.bubble\.has-delivery-indicator \.bubble-text-paragraph-with-inline-meta:has\(\.bubble-text-inline-meta-stacked\) \{\s*padding-right: 0;/u)
  assert.match(appCss, /\.bubble \.bubble-text-inline-meta \{\s*position: absolute;\s*right: 0;\s*bottom: 0;/u)
  assert.match(appCss, /\.bubble \.bubble-text-inline-meta\.bubble-text-inline-meta-stacked \{\s*position: static;\s*width: 100%;\s*justify-content: flex-end;\s*align-items: center;/u)
  assert.match(bubbleSource, /className=\{edited \? 'bubble-text-inline-meta bubble-text-inline-meta-stacked' : 'bubble-text-inline-meta'\}/u)
  assert.match(appCss, /\.bubble-text-paragraph-with-inline-meta > \.bubble-text-content \{\s*white-space: pre-wrap;/u)
  assert.match(
    appCss,
    /\.bubble \.bubble-text-inline-meta time,\s*\.group-room-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-text-inline-meta time,\s*\.room-thread-feed \.bubble:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-text-inline-meta time,\s*\.bubble-overlay\.bubble-overlay-compact:not\(\.media-only-bubble\):not\(\.emoji-only-message\) \.bubble-text-inline-meta time \{\s*display: block;\s*margin: 0;\s*padding: 0;/u,
  )
})

test('file attachment bubbles keep a left badge layout with inline bottom-right meta', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    bubbleSource,
    /className=\{`bubble-attachment bubble-attachment-link\$\{isFileAttachmentOnlyBubble \? ' bubble-attachment-link-file-only' : ''\}`\}/u,
  )
  assert.match(bubbleSource, /className="bubble-attachment-badge-icon" src="\/icons\/dwnl\.png"/u)
  assert.match(bubbleSource, /className="bubble-attachment-copy-row"/u)
  assert.match(bubbleSource, /className="bubble-attachment-copy-status"/u)
  assert.match(bubbleSource, /className="bubble-attachment-inline-meta"/u)
  assert.match(
    directRoomSource,
    /message\.text\.trim\(\)\.length > 0 \|\| Boolean\(message\.attachment\)/u,
  )
  assert.match(
    groupRoomSource,
    /message\.text\.trim\(\)\.length > 0 \|\| Boolean\(message\.attachment\)/u,
  )
  assert.match(
    channelRoomSource,
    /post\.text\.trim\(\)\.length > 0 \|\| Boolean\(post\.attachment\)/u,
  )
  assert.match(
    overlaySource,
    /props\.post\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.post\.attachment\)/u,
  )
  assert.match(
    overlaySource,
    /props\.comment\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.comment\.attachment\)/u,
  )
  assert.match(
    overlaySource,
    /props\.message\.text\.trim\(\)\.length > 0 \|\| Boolean\(props\.message\.attachment\)/u,
  )
  assert.match(
    appSource,
    /threadSourceText\.trim\(\)\.length > 0 \|\| Boolean\(threadGroupMessage\.attachment\)/u,
  )
  assert.match(
    appSource,
    /threadSourceText\.trim\(\)\.length > 0 \|\| Boolean\(threadChannelPost\.attachment\)/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-link \{\s*display: grid;\s*grid-template-columns: 52px minmax\(0, 1fr\);[\s\S]*align-items: start;[\s\S]*gap: 8px;/u,
  )
  assert.match(appCss, /\.bubble-attachment-link-file-only \{[\s\S]*min-height: 52px;/u)
  assert.match(appCss, /\.bubble:has\(> \.bubble-attachment-link-file-only\) \{[\s\S]*padding: 9px 14px 8px 12px;/u)
  assert.match(
    appCss,
    /\.bubble-attachment-badge \{[\s\S]*width: 52px;[\s\S]*height: 52px;[\s\S]*border-radius: 16px;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-badge-icon \{[\s\S]*width: 16px;[\s\S]*height: 16px;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-copy-row \{\s*display: flex;[\s\S]*align-items: flex-end;[\s\S]*justify-content: space-between;/u,
  )
  assert.match(
    appCss,
    /\.bubble \.bubble-attachment-inline-meta > \.bubble-text-inline-meta \{\s*position: static;/u,
  )
})

test('pending attachment delivery keeps progress UI separate from failed-send captions', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const outboxSource = readFileSync(join(repoRoot, 'src', 'app', 'usePendingMessageOutbox.ts'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(
    join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'),
    'utf8',
  )
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(outboxSource, /uploadProgress\?: number/u)
  assert.match(outboxSource, /export const PENDING_ATTACHMENT_FINALIZING_PROGRESS = 0\.99/u)
  assert.match(outboxSource, /setPendingDirectMessageUploadProgress/u)
  assert.match(outboxSource, /setPendingGroupMessageUploadProgress/u)
  assert.match(outboxSource, /message\.attachmentDraft\.mediaUrl[\s\S]*PENDING_ATTACHMENT_FINALIZING_PROGRESS/u)
  assert.match(outboxSource, /uploadProgress:\s*undefined/u)
  assert.match(backendSource, /type UploadMediaFileOptions = \{[\s\S]*onProgress\?: \(progress: number\) => void/u)
  assert.match(backendSource, /const ATTACHMENT_UPLOAD_TRANSFER_PROGRESS_MAX = 0\.97/u)
  assert.match(backendSource, /const ATTACHMENT_UPLOAD_FINALIZING_PROGRESS = 0\.99/u)
  assert.match(backendSource, /request\.upload\.onprogress = \(event\) => \{/u)
  assert.match(backendSource, /onProgress\(ATTACHMENT_UPLOAD_FINALIZING_PROGRESS\)/u)
  assert.match(directRoomSource, /const showDeliveryCaption = messageFailed && shouldShowDeliveryCaption\(message\)/u)
  assert.match(groupRoomSource, /const showDeliveryCaption = messageFailed && shouldShowDeliveryCaption\(message\)/u)
  assert.match(
    overlaySource,
    /const showDeliveryCaption = props\.deliveryIssue === 'failed' && shouldShowDeliveryCaption\(props\.message\)/u,
  )
  assert.match(directRoomSource, /const messageUploadProgress =[\s\S]*getMessageUploadProgress\(message\.id\)/u)
  assert.match(groupRoomSource, /const messageUploadProgress =[\s\S]*getMessageUploadProgress\(message\.id\)/u)
  assert.match(appSource, /setPendingDirectMessageUploadProgress\(localId,\s*progress\)/u)
  assert.match(appSource, /setPendingGroupMessageUploadProgress\(localId,\s*progress\)/u)
  assert.match(appSource, /uploadProgress:\s*PENDING_ATTACHMENT_FINALIZING_PROGRESS/u)
  assert.match(bubbleSource, /uploadProgress\?: number/u)
  assert.match(bubbleSource, /const ATTACHMENT_UPLOAD_FINALIZING_PROGRESS = 0\.99/u)
  assert.match(bubbleSource, /Отправляем файл\.\.\./u)
  assert.match(bubbleSource, /bubble-attachment-upload-progress/u)
  assert.match(bubbleSource, /aria-valuenow=\{uploadProgressPercent \?\? 0\}/u)
  assert.match(appCss, /\.bubble-attachment-upload-progress \{[\s\S]*height: 9px;/u)
  assert.match(
    appCss,
    /\.bubble\.mine \.bubble-attachment-upload-progress \{[\s\S]*background: rgba\(125, 86, 58, 0\.14\);/u,
  )
  assert.match(appCss, /\.bubble-attachment-upload-progress-fill \{/u)
  assert.match(
    appCss,
    /\.bubble\.mine \.bubble-attachment-upload-progress-fill \{[\s\S]*rgba\(140, 89, 57, 0\.82\)[\s\S]*rgba\(204, 163, 128, 0\.98\)/u,
  )
  assert.match(appCss, /\.bubble-attachment-upload-progress-overlay \{[\s\S]*height: 8px;/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.bubble\.mine \.bubble-attachment-upload-progress-fill \{[\s\S]*rgba\(232, 220, 213, 0\.9\)[\s\S]*rgba\(255, 255, 255, 0\.99\)/u,
  )
})

test('file attachment bubbles keep compact download affordance and reserve 100 percent for confirmed sends', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const outboxSource = readFileSync(join(repoRoot, 'src', 'app', 'usePendingMessageOutbox.ts'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(bubbleSource, /const isFileAttachmentOnlyBubble =/u)
  assert.match(
    bubbleSource,
    /className=\{`bubble-attachment bubble-attachment-link\$\{isFileAttachmentOnlyBubble \? ' bubble-attachment-link-file-only' : ''\}`\}/u,
  )
  assert.match(bubbleSource, /className="bubble-attachment-badge-icon" src="\/icons\/dwnl\.png"/u)
  assert.match(bubbleSource, /Отправляем файл\.\.\./u)
  assert.match(
    appCss,
    /\.bubble-attachment-link \{[\s\S]*grid-template-columns: 52px minmax\(0, 1fr\);[\s\S]*align-items: start;[\s\S]*gap: 8px;/u,
  )
  assert.match(appCss, /\.bubble-attachment-link-file-only \{[\s\S]*min-height: 52px;/u)
  assert.match(appCss, /\.bubble:has\(> \.bubble-attachment-link-file-only\) \{[\s\S]*padding: 9px 14px 8px 12px;/u)
  assert.match(
    appCss,
    /\.bubble-attachment-badge \{[\s\S]*width: 52px;[\s\S]*height: 52px;[\s\S]*border-radius: 16px;/u,
  )
  assert.match(appCss, /\.bubble-attachment-badge-icon \{[\s\S]*width: 16px;[\s\S]*height: 16px;/u)
  assert.match(appCss, /\.bubble-attachment-upload-progress \{[\s\S]*height: 9px;/u)
  assert.match(appCss, /\.bubble-attachment-upload-progress-overlay \{[\s\S]*height: 8px;/u)
  assert.match(outboxSource, /export const PENDING_ATTACHMENT_FINALIZING_PROGRESS = 0\.99/u)
  assert.match(appSource, /uploadProgress:\s*PENDING_ATTACHMENT_FINALIZING_PROGRESS/u)
  assert.match(backendSource, /onProgress\(ATTACHMENT_UPLOAD_FINALIZING_PROGRESS\)/u)
  assert.doesNotMatch(appSource, /uploadProgress:\s*1/u)
  assert.doesNotMatch(backendSource, /onProgress\(1\)/u)
})

test('standalone emoji messages stay bubbleless only in direct and unthreaded group room feeds', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(sharedUtilsSource, /export function isStandaloneEmojiMessageText\(text: string\)/u)
  assert.match(sharedUtilsSource, /Intl\.Segmenter/u)
  assert.match(sharedUtilsSource, /\\p\{Extended_Pictographic\}/u)
  assert.match(bubbleSource, /export function EmojiOnlyMessageContent/u)
  assert.match(bubbleSource, /emoji-only-message-glyph/u)
  assert.match(directRoomSource, /const isStandaloneEmojiOnlyMessage =[\s\S]*isStandaloneEmojiMessageText\(message\.text\)/u)
  assert.match(directRoomSource, /bubbleClassNames\.push\('emoji-only-message'\)/u)
  assert.match(directRoomSource, /<EmojiOnlyMessageContent/u)
  assert.match(groupRoomSource, /const isStandaloneEmojiOnlyMessage =[\s\S]*message\.threadComments\?\.length \?\? 0\) === 0[\s\S]*isStandaloneEmojiMessageText\(message\.text\)/u)
  assert.match(groupRoomSource, /bubbleClassNames\.push\('emoji-only-message'\)/u)
  assert.match(groupRoomSource, /<EmojiOnlyMessageContent/u)
  assert.match(overlaySource, /const isStandaloneEmojiOnlyMessage =[\s\S]*isStandaloneEmojiMessageText\(props\.message\.text\)/u)
  assert.match(overlaySource, /bubbleClassNames\.push\('emoji-only-message'\)/u)
  assert.match(overlaySource, /<EmojiOnlyMessageContent/u)
  assert.doesNotMatch(channelRoomSource, /emoji-only-message/u)
  assert.match(appCss, /\.bubble\.emoji-only-message \{\s*display: inline-flex;/u)
  assert.match(
    appCss,
    /\.bubble\.emoji-only-message \.emoji-only-message-glyph \{\s*display: flex;\s*align-items: center;\s*min-height: 3rem;\s*font-size: 2\.5rem;/u,
  )
  assert.match(appCss, /\.bubble\.emoji-only-message \.emoji-only-message-meta \{\s*display: inline-flex;/u)
  assert.match(appCss, /\.bubble\.emoji-only-message\.bubble-button\.selected,\s*\.bubble-overlay\.bubble-button\.selected\.emoji-only-message \{/u)
  assert.match(
    bubbleSource,
    /shouldUseLightDeliveryIndicatorTint\(deliveryIndicatorSrc\)[\s\S]*'emoji-only-message-indicator emoji-only-message-indicator-light'/u,
  )
  assert.match(appCss, /\.bubble\.emoji-only-message \.emoji-only-message-indicator-light \{\s*filter: brightness\(0\) invert\(1\);/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.bubble\.emoji-only-message \.emoji-only-message-meta \{\s*color: rgba\(255,\s*248,\s*242,\s*0\.66\);/u,
  )
  })

test('contact cards have an explicit UI contract and open direct dialogs on tap', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const bubbleSource = readFileSync(
    join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'),
    'utf8',
  )

  assert.match(bubbleSource, /export function ForwardedContactHeader/u)
  assert.match(bubbleSource, /img src="\/icons\/contacts100\.svg"/u)
  assert.match(bubbleSource, /onOpenSourceContact/u)
  assert.match(appSource, /async function openSourceContactAsync/u)
  assert.match(appSource, /Failed to open direct dialog from contact link/u)
  assert.match(appSource, /openDirectDialogRequest\(session\.sessionToken/u)
  assert.match(
    bubbleSource,
    /trimmedText !== message\.sourceContact\?\.handle\?\.trim\(\)/u,
  )
  assert.match(
    bubbleSource,
    /shouldRenderContactBodyText \? \(\s*<BubbleRichText[\s\S]*inlineMeta=\{inlineMeta\}[\s\S]*text=\{message\.text\}[\s\S]*onOpenExternalLink=\{onOpenExternalLink\}[\s\S]*\/>/u,
  )
})

test('direct room exposes contact sharing with recipient selection and signature note', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')

  assert.match(directRoomSource, /Поделиться контактом/u)
  assert.match(appSource, /Кому отправить контакт/u)
  assert.match(appSource, /Напишите, почему делитесь этим контактом/u)
  assert.match(appSource, /shareCurrentContactToSelectedChats/u)
  assert.match(appSource, /const sourceContact = buildSourceContactFromChat\(activeChat\)/u)
})

test('group system events stay plain info rows with clickable actor links and premium crown support', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(groupRoomSource, /message\.system \? \(/u)
  assert.match(groupRoomSource, /className="group-system-message"/u)
  assert.match(groupRoomSource, /message\.groupSystemEvent/u)
  assert.match(groupRoomSource, /group-system-message-crown/u)
  assert.match(groupRoomSource, /group-system-message-actor-link/u)
  assert.match(groupRoomSource, /openGroupSystemActorContact/u)
  assert.match(groupRoomSource, /normalizeIdentifier\(actor\.identifier \?\? ''\)/u)
  assert.match(groupRoomSource, /onOpenSourceContact\(\{\s*accent:\s*matchingParticipant\?\.accent,/u)
  assert.match(
    appCss,
    /\.group-system-message\s*\{[\s\S]*justify-content:\s*center;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*text-align:\s*center;/u,
  )
  assert.match(appCss, /\.group-system-message-actor\s*\{/u)
  assert.match(appCss, /\.group-system-message-actor-link\s*\{/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.group-system-message-actor-link\s*\{/u)
  assert.doesNotMatch(
    appCss,
    /html\[data-theme='dark'\] \.channel-system-post,\s*[\s\S]*html\[data-theme='dark'\] \.conversation-day-divider span,\s*[\s\S]*html\[data-theme='dark'\] \.group-system-message,\s*[\s\S]*html\[data-theme='dark'\] \.direct-system-message-label,\s*[\s\S]*background:\s*rgba\(36,\s*37,\s*43,\s*0\.94\);/u,
  )
})

test('channel system posts keep the shared dark-theme pill contract', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(channelRoomSource, /className="channel-system-post"/u)
  assert.match(channelRoomSource, /className="channel-system-post-label"/u)
  assert.match(appCss, /\.channel-system-post\s*\{/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.browser-notification-banner,\s*[\s\S]*html\[data-theme='dark'\] \.channel-system-post,\s*[\s\S]*html\[data-theme='dark'\] \.conversation-day-divider span,\s*[\s\S]*background:\s*rgba\(36,\s*37,\s*43,\s*0\.94\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.room-forward-item-status,\s*[\s\S]*html\[data-theme='dark'\] \.channel-system-post,\s*[\s\S]*html\[data-theme='dark'\] \.direct-system-message-label,\s*[\s\S]*color:\s*#bcc1ca;/u,
  )
})

test('group actions menu keeps leave action at the bottom for non-owners', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const menuStart = appSource.indexOf('const groupRoomActions = activeGroup ? (')
  const menuEnd = appSource.indexOf('{groupInviteOpen ? (', menuStart)

  assert.ok(menuStart >= 0)
  assert.ok(menuEnd > menuStart)

  const menuSource = appSource.slice(menuStart, menuEnd)
  const leaveIndex = menuSource.lastIndexOf('Покинуть группу')
  const reportIndex = menuSource.indexOf('Пожаловаться')
  const muteIndex = menuSource.indexOf("Включить уведомления' : 'Заглушить")
  const inviteIndex = menuSource.indexOf('Пригласить в группу')

  assert.ok(leaveIndex > reportIndex)
  assert.ok(leaveIndex > muteIndex)
  assert.ok(leaveIndex > inviteIndex)
})

test('group management popup centers action labels and keeps delete action explicitly danger-styled', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /className="room-forward-list room-management-actions"/u)
  assert.match(appSource, /className="room-forward-item room-management-item"/u)
  assert.match(appSource, /className="room-forward-item room-management-item room-confirm-danger"/u)
  assert.match(appCss, /\.room-management-item \{[\s\S]*justify-content: center;[\s\S]*text-align: center;/u)
  assert.match(appCss, /\.room-management-actions \.room-forward-item\.room-confirm-danger \{/u)
})

test('group and channel management popup titles are centered', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /className="room-confirm-copy room-confirm-copy-centered">Управление каналом<\/p>/u)
  assert.match(appSource, /className="room-confirm-copy room-confirm-copy-centered">Управление группой<\/p>/u)
  assert.match(appCss, /\.room-confirm-copy-centered \{\s*text-align: center;\s*\}/u)
})

test('docs lock quiet-mode stealth bonuses for group join and leave', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(handoffDoc, /если у участника включён server-side `Тихо` \(`quietModeEnabled`\), системная надпись о join не создаётся/u)
  assert.match(handoffDoc, /если у участника включён server-side `Тихо` \(`quietModeEnabled`\), системная надпись о leave не создаётся/u)
  assert.match(handoffDoc, /`Выключить звуки` не влияет на stealth join\/leave/u)
  assert.match(handoffDoc, /смена организатора группы всегда публикует системное событие/u)
  assert.match(rolloutDoc, /quiet join -> системной надписи нет/u)
  assert.match(rolloutDoc, /quiet leave -> системной надписи нет/u)
  assert.match(rolloutDoc, /owner transfer -> видно `У группы новый организатор:/u)
})

test('group invite eligibility no longer relies on participant title matching', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.doesNotMatch(appSource, /participant\.title === chat\.title/u)
  assert.doesNotMatch(storeSource, /participant\.title === recipientTitle/u)
  assert.match(appSource, /const activeGroupParticipantIdentifiers = useMemo/u)
  assert.match(appSource, /alreadyMember: activeGroupParticipantIdentifiers\.has\(normalizeIdentifier\(chat\.phone\)\)/u)
  assert.match(appSource, /Этот контакт уже состоит в группе\./u)
  assert.match(appSource, /room-forward-item-status">Уже в группе/u)
  assert.match(appSource, /room-forward-item-inline-error/u)
  assert.match(appCss, /\.room-forward-item-status\s*\{/u)
  assert.match(appCss, /\.room-forward-item-inline-error\s*\{/u)
  assert.match(handoffDocFallback(), /membership определяется только active membership copies \/ normalized identifier/u)
})

function handoffDocFallback() {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  return readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
}

test('room feeds auto-scroll to the latest message on open and stay sticky near bottom', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const scrollPolicySource = readFileSync(join(repoRoot, 'src', 'app', 'roomFeedScroll.ts'), 'utf8')
  const autoScrollControllerSource = readFileSync(
    join(repoRoot, 'src', 'app', 'useRoomFeedAutoScroll.ts'),
    'utf8',
  )
  const autoScrollRuntimeSource = readFileSync(
    join(repoRoot, 'src', 'app', 'roomFeedAutoScroll.ts'),
    'utf8',
  )
  const readSyncSource = readFileSync(join(repoRoot, 'src', 'app', 'roomReadSync.ts'), 'utf8')
  const historyWindowSource = readFileSync(
    join(repoRoot, 'src', 'app', 'useRoomHistoryWindow.ts'),
    'utf8',
  )

  assert.match(appSource, /const activeRoomFeedTimeline = threadTarget/u)
  assert.match(appSource, /requestRoomFeedScrollToBottom\('local-send'\)/u)
  assert.match(appSource, /const activeRoomHistoryMutation = threadTarget/u)
  assert.match(appSource, /useRoomFeedAutoScroll\(\{/u)
  assert.match(appSource, /const activeRoomReadTarget: ActiveRoomReadTarget \| null = threadTarget/u)
  assert.match(appSource, /document\.visibilityState === 'visible'/u)
  assert.match(appSource, /shouldSyncActiveRoomRead\(/u)
  assert.match(appSource, /syncDialogRead\(activeRoomReadTarget\.id\)/u)
  assert.match(appSource, /syncGroupRead\(activeRoomReadTarget\.id\)/u)
  assert.match(appSource, /syncSubscriptionChannelRead\(activeRoomReadTarget\.id\)/u)
  assert.match(scrollPolicySource, /export function classifyRoomFeedChange/u)
  assert.match(scrollPolicySource, /export function shouldAutoScrollRoomFeed/u)
  assert.match(autoScrollControllerSource, /Critical scroll invariant:/u)
  assert.match(autoScrollControllerSource, /createPendingRoomFeedScroll/u)
  assert.match(autoScrollControllerSource, /Keep local-send\/media-relayout sticky longer/u)
  assert.match(autoScrollControllerSource, /reason === 'local-send'/u)
  assert.match(autoScrollControllerSource, /reason === 'media-relayout'/u)
  assert.match(autoScrollControllerSource, /shouldPreserveStickyRoomFeedScroll/u)
  assert.match(autoScrollControllerSource, /ResizeObserver/u)
  assert.match(autoScrollControllerSource, /feed\.addEventListener\('load', handleMediaLoad, true\)/u)
  assert.match(autoScrollRuntimeSource, /export function advancePendingRoomFeedScroll/u)
  assert.match(autoScrollRuntimeSource, /export function shouldPreserveStickyRoomFeedScroll/u)
  assert.match(readSyncSource, /export function shouldSyncActiveRoomRead/u)
  assert.match(readSyncSource, /export function getActiveRoomReadKey/u)
  assert.match(historyWindowSource, /kind: 'idle' \| 'prepend' \| 'reset'/u)
  assert.match(historyWindowSource, /setHistoryMutation/u)
})

test('scroll contract is documented as a critical release invariant', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const runbookDoc = readFileSync(join(repoRoot, 'docs', 'new-thread-runbook.md'), 'utf8')
  const collaborationDoc = readFileSync(join(repoRoot, 'docs', 'collaboration-instructions.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(handoffDoc, /автоскролл вниз в комнатах — критичный UI-инвариант/u)
  assert.match(handoffDoc, /opening room must land on the latest item/u)
  assert.match(handoffDoc, /visible scrollbar в room feed считается дефектом layout/u)
  assert.match(handoffDoc, /открытая и видимая комната не должна копить stale unread/u)
  assert.match(handoffDoc, /static source-contract tests недостаточны/u)
  assert.match(handoffDoc, /runtime DOM tests/u)
  assert.match(handoffDoc, /широкий `touch-action`/u)
  assert.match(handoffDoc, /desktop wheel \/ trackpad scroll/u)
  assert.match(runbookDoc, /scroll \/ overflow \/ touch scrolling/u)
  assert.match(runbookDoc, /нельзя делать широкий CSS-фикс через глобальный `touch-action`/u)
  assert.match(collaborationDoc, /Как Проверять Scroll \/ Overflow/u)
  assert.match(collaborationDoc, /desktop:/u)
  assert.match(collaborationDoc, /mobile:/u)
  assert.match(rolloutDoc, /room feed scrollbar должен оставаться скрытым/u)
  assert.match(rolloutDoc, /автоскролл вниз в room feed — критичная проверка/u)
  assert.match(rolloutDoc, /own send must always land on the latest item/u)
  assert.match(rolloutDoc, /если direct \/ group \/ channel открыт и видим пользователю, новые входящие должны сразу считаться прочитанными/u)
  assert.match(rolloutDoc, /runtime DOM tests для room feed обязательны/u)
  assert.match(releaseDoc, /visible scrollbar поверх bubbles в room feed считается release-blocking visual bug/u)
  assert.match(appCss, /\.message-feed\s*\{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;/u)
  assert.ok(appCss.includes('.message-feed::-webkit-scrollbar'))
  assert.match(appCss, /\.message-feed::[\s\S]*display:\s*none;[\s\S]*width:\s*0;[\s\S]*height:\s*0;/u)
})

test('image-only media bubble styling no longer uses destructive negative margin path', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appCss, /\.media-bubble-row\s*\{/u)
  assert.match(appCss, /\.bubble-attachment-photo\.image-only\s*\{\s*margin:\s*0;/u)
  assert.doesNotMatch(
    appCss,
    /\.bubble-attachment-photo\.image-only\s*\{\s*margin:\s*-[0-9]/u,
  )
})

test('mobile gif bubbles stretch to the full media slot width instead of shrinking to intrinsic size', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')

  assert.match(bubbleSource, /const isGifAttachment = message\.attachment\?\.mimeType === 'image\/gif'/u)
  assert.match(
    bubbleSource,
    /isVideoNote \? ' bubble-attachment-photo-video-note' : ''\}\$\{[\s\S]*isGifAttachment \? ' bubble-attachment-photo-gif' : ''/u,
  )
  assert.match(
    appCss,
    /@media \(max-width: 960px\) \{[\s\S]*\.media-bubble-row > \.bubble\.media-only-bubble \.bubble-attachment-photo-gif\.image-only,\s*[\s\S]*\.media-bubble-row > \.channel-post\.media-only-bubble \.bubble-attachment-photo-gif\.image-only \{\s*width:\s*100%;[\s\S]*max-width:\s*100%;/u,
  )
})

test('nickname and channel direct link use inline copy buttons inside the field', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /settings-handle settings-handle-copyable/u)
  assert.match(appSource, /Копировать никнейм/u)
  assert.match(appSource, /className="settings-inline-copy-button"/u)
  assert.doesNotMatch(appSource, /className="soft-button channel-link-copy"/u)
  assert.match(appCss, /\.settings-inline-copy-button\s*\{/u)
  assert.match(appCss, /\.settings-input-with-inline-icon\s*\{/u)
})

test('auth screen keeps blocked phone login inline without sms submit button', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const authScreenSource = readFileSync(join(repoRoot, 'src', 'screens', 'AuthScreen.tsx'), 'utf8')

  assert.match(authScreenSource, /Аккаунт заблокирован по решению администрации\./u)
  assert.match(
    authScreenSource,
    /Если вы считаете ограничение неправильным, обратитесь в поддержку\./u,
  )
  assert.match(
    authScreenSource,
    /const showInlineBlockedNotice = isPhoneStep && authPhoneBlockedNotice/u,
  )
  assert.match(
    authScreenSource,
    /!\s*showInlineBlockedNotice && captchaPlacement && captchaProvider === 'smartcaptcha'/u,
  )
  assert.match(authScreenSource, /!\s*showInlineBlockedNotice \? \(\s*<button type="submit"/su)
})

test('auth screen keeps contacts link separate from legal consent copy', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const authScreenSource = readFileSync(join(repoRoot, 'src', 'screens', 'AuthScreen.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(authScreenSource, /Продолжая авторизацию, вы соглашаетесь с/u)
  assert.match(authScreenSource, /Пользовательским соглашением/u)
  assert.match(authScreenSource, /Политикой обработки персональных данных/u)
  assert.doesNotMatch(
    authScreenSource,
    /Продолжая авторизацию, вы соглашаетесь с[\s\S]*Контактами и реквизитами/u,
  )
  assert.match(authScreenSource, /className="auth-support-meta-link" href="\/contacts\.html"/u)
  assert.match(appCss, /\.auth-support-row\s*\{/u)
  assert.match(appCss, /\.auth-support-meta-link\s*\{/u)
})

test('admin auth code step exposes explicit resend path', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')

  assert.match(adminSource, /Запросить код заново/u)
  assert.match(adminSource, /setAuthStep\('phone'\)/u)
  assert.match(adminSource, /resetCaptcha\(\)/u)
})

test('direct contact requests render gated composer states and system message row', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /Отправить запрос на контакт/u)
  assert.match(appSource, /Заявка на контакт отправлена/u)
  assert.match(appSource, /Отменить заявку/u)
  assert.match(appSource, /composer-disabled-note-friendly-content/u)
  assert.match(appSource, /const activeChatPendingOutgoingMessageTone: 'danger' \| 'friendly' = contactRequestActionError/u)
  assert.match(appSource, /messageTone: activeChatPendingOutgoingMessageTone/u)
  assert.match(appSource, /tone: 'neutral' as const/u)
  assert.match(appSource, /\/icons\/man-raising-hand\.png/u)
  assert.match(appSource, /Пользователь заблокировал контакт с вами/u)
  assert.match(directRoomSource, /Подтвердить контакт/u)
  assert.match(directRoomSource, /Отклонить контакт/u)
  assert.match(directRoomSource, /Заблокировать контакт/u)
  assert.match(directRoomSource, /tone\?: 'danger' \| 'neutral' \| 'primary'/u)
  assert.match(directRoomSource, /messageTone\?: 'danger' \| 'friendly'/u)
  assert.match(directRoomSource, /message\.system \? \(/u)
  assert.match(directRoomSource, /className="direct-system-message"/u)
  assert.match(directRoomSource, /effectiveComposerGate\.tone === 'danger'/u)
  assert.match(directRoomSource, /effectiveComposerGate\.tone === 'neutral'/u)
  assert.match(directRoomSource, /room-confirm-button room-confirm-danger/u)
  assert.match(appCss, /\.direct-system-message\s*\{/u)
  assert.match(appCss, /\.composer-gate-button\s*\{/u)
  assert.match(appCss, /\.composer-disabled-note-friendly\s*\{/u)
  assert.match(appCss, /\.composer-disabled-note-friendly-content img\s*\{/u)
})

test('incoming contact requests open direct room review flow with full-width composer actions', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const contactRequestCardSource = readFileSync(
    join(repoRoot, 'src', 'components', 'ContactRequestCard.tsx'),
    'utf8',
  )
  const contactRequestFlowSource = readFileSync(
    join(repoRoot, 'src', 'app', 'useContactRequestsFlow.ts'),
    'utf8',
  )
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const contactsFeatureSource = [appSource, contactRequestCardSource, contactRequestFlowSource].join('\n')

  assert.match(contactsFeatureSource, /openIncomingContactRequest/u)
  assert.match(contactRequestFlowSource, /void openContactRequestRoom\(request\.identifier\)/u)
  assert.match(contactsFeatureSource, /className="chat-card-request-main"/u)
  assert.match(contactsFeatureSource, /className="contact-request-card-action"/u)
  assert.match(contactsFeatureSource, /className="contact-request-card-open contact-request-card-icon outgoing"/u)
  assert.match(contactsFeatureSource, /aria-label="Открыть заявку"/u)
  assert.match(contactsFeatureSource, /aria-label="Подтвердить контакт"/u)
  assert.match(contactsFeatureSource, /onAcceptIncomingRequest\(request\.identifier\)/u)
  assert.match(contactsFeatureSource, /openChatInContacts\(existingChat\.id\)/u)
  assert.match(contactsFeatureSource, /openChatInContacts\(response\.dialogId\)/u)
  assert.match(appSource, /kind: 'incoming-request' as const/u)
  assert.match(appSource, /Пользователь хочет выйти на связь/u)
  assert.match(directRoomSource, /effectiveComposerGate\.kind === 'incoming-request'/u)
  assert.match(directRoomSource, /onComposerGateAccept/u)
  assert.match(directRoomSource, /Подтвердить контакт/u)
  assert.match(directRoomSource, /Incoming requests are resolved only inside the shared room/u)
  assert.match(appCss, /\.chat-card-request-main\s*\{/u)
  assert.match(appCss, /\.contact-request-card-action\s*\{/u)
  assert.match(appCss, /\.contact-request-card-open\s*\{/u)
  assert.match(appCss, /\.contact-request-card-icon\.outgoing\s*\{[\s\S]*background: transparent;/u)
  assert.match(appCss, /\.composer-gate-actions\s*\{/u)
})

test('contacts screen splits incoming requests from accepted contacts', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const contactsContractSource = readFileSync(
    join(repoRoot, 'src', 'app', 'contactsContract.ts'),
    'utf8',
  )
  const contactsFiltersSource = readFileSync(
    join(repoRoot, 'src', 'components', 'ContactsFilters.tsx'),
    'utf8',
  )
  const contactsPaneSource = readFileSync(
    join(repoRoot, 'src', 'components', 'ContactsPane.tsx'),
    'utf8',
  )
  const contactRequestCardSource = readFileSync(
    join(repoRoot, 'src', 'components', 'ContactRequestCard.tsx'),
    'utf8',
  )
  const contactRequestFlowSource = readFileSync(
    join(repoRoot, 'src', 'app', 'useContactRequestsFlow.ts'),
    'utf8',
  )
  const iconContractSource = readFileSync(join(repoRoot, 'src', 'app', 'iconContracts.ts'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const contactsFeatureSource = [
    appSource,
    contactsContractSource,
    contactsFiltersSource,
    contactsPaneSource,
    contactRequestCardSource,
    contactRequestFlowSource,
  ].join('\n')

  assert.match(contactsContractSource, /export const contactTabs = \[/u)
  assert.match(contactsContractSource, /label: 'Все'/u)
  assert.match(contactsContractSource, /label: 'Новые заявки'/u)
  assert.match(contactsContractSource, /label: 'Отправленные заявки'/u)
  assert.match(appSource, /contactsTab/u)
  assert.match(appSource, /bottomSection === 'contacts'\s*\?\s*'filters contacts-filters'/u)
  assert.match(contactsFiltersSource, /shouldShowContactsTabBadge/u)
  assert.match(contactsFiltersSource, /suppressContactRequestBadges/u)
  assert.match(contactsFiltersSource, /aria-label=\{tab\.label\}/u)
  assert.match(contactsFiltersSource, /title=\{tab\.label\}/u)
  assert.match(contactsFiltersSource, /className=\{contactsTab === tab\.key \? 'filter contacts-filter active' : 'filter contacts-filter'\}/u)
  assert.match(contactsFiltersSource, /tab\.key === 'all' \? \(/u)
  assert.match(contactsFiltersSource, /className="contacts-filter-content"/u)
  assert.match(contactsFiltersSource, /getContactRequestCardIconPath\(tab\.key === 'incoming' \? 'incoming' : 'outgoing'\)/u)
  assert.match(contactsFiltersSource, /className="filter-icon contacts-filter-icon"/u)
  assert.match(contactsPaneSource, /room-forward-section-title contacts-section-title">Заявки</u)
  assert.match(contactsPaneSource, /room-forward-section-title contacts-section-title">Отправленные запросы</u)
  assert.match(contactsPaneSource, /room-forward-section-title contacts-section-title">Контакты</u)
  assert.match(contactsPaneSource, /contactRequests\.map/u)
  assert.match(contactsPaneSource, /outgoingContactRequests\.map/u)
  assert.match(contactsPaneSource, /showIncomingRequestsInAllContacts/u)
  assert.match(contactsPaneSource, /showOutgoingRequestsInAllContacts/u)
  assert.match(contactsPaneSource, /contacts-empty-note">Заявок пока нет/u)
  assert.match(contactsPaneSource, /Отправленных заявок пока нет/u)
  assert.match(contactsPaneSource, /room-forward-section-title contacts-section-title">Заявки/u)
  assert.match(contactsPaneSource, /room-forward-section-title contacts-section-title">Контакты/u)
  assert.doesNotMatch(contactsFeatureSource, /Новые запросы на контакт появятся здесь/u)
  assert.match(appSource, /icon-button-badge/u)
  assert.match(appSource, /quietContactRequestsSuppressed/u)
  assert.match(appSource, /!quietContactRequestsSuppressed && incomingContactRequestCount > 0/u)
  assert.match(
    appSource,
    /incomingContactRequestCount > 9\s*\?\s*'icon-button-badge icon-button-badge-wide'\s*:\s*'icon-button-badge'/u,
  )
  assert.match(contactsPaneSource, /normalizeIdentifier\(activeContactIdentifier\) === normalizeIdentifier\(request\.identifier\)/u)
  assert.match(contactRequestCardSource, /chat-card contact-list-card chat-card-request active/u)
  assert.match(appSource, /filter-inline-content filter-inline-content-compact/u)
  assert.match(appSource, /filter-with-inline-badge filter-with-inline-badge-compact/u)
  assert.doesNotMatch(appSource, /icon-button-badge[\s\S]{0,200}outgoingContactRequestCount/u)
  assert.match(iconContractSource, /incoming: '\/icons\/handshake\.png'/u)
  assert.match(iconContractSource, /outgoing: '\/icons\/man-raising-hand\.png'/u)
  assert.match(appCss, /\.contacts-filters\s*\{/u)
  assert.match(appCss, /\.contacts-filter\s*\{/u)
  assert.match(appCss, /\.contacts-filter \.filter-badge\s*\{/u)
  assert.match(appCss, /\.contacts-filter-content\s*\{/u)
  assert.match(appCss, /\.contacts-filter-icon\s*\{/u)
  assert.match(appCss, /\.chat-card-request-main\s*\{[\s\S]*grid-column: 1 \/ span 2;/u)
  assert.match(appCss, /\.chat-card\.chat-card-request > \.contact-request-card-action,\s*\n\.chat-card\.chat-card-request > \.contact-request-card-icon/u)
  assert.match(appCss, /\.contacts-section-title\s*\{/u)
  assert.match(appCss, /\.contacts-section \+ \.contacts-section\s*\{/u)
  assert.match(appCss, /\.contacts-section\s*\{[\s\S]*gap: 3px;/u)
  assert.match(appCss, /\.contacts-section \.chat-card\s*\{[\s\S]*padding: 12px 13px 12px 10px;[\s\S]*gap: 10px;[\s\S]*border-radius: 20px;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.contacts-section \.chat-card\s*\{[\s\S]*background:\s*rgba\(33,\s*35,\s*43,\s*0\.98\);[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.07\);/u)
  assert.match(appCss, /\.filter-inline-content\s*\{/u)
  assert.match(appCss, /\.filter-inline-content-compact\s*\{/u)
  assert.match(appCss, /\.filter-with-inline-badge \.filter-inline-content-compact \.filter-icon/u)
  assert.match(appCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u)
  assert.match(appCss, /\.filter-badge\.filter-badge-light\s*\{/u)
  assert.match(appCss, /\.chat-topline-badge\s*\{[\s\S]*width:\s*24px;[\s\S]*height:\s*24px;[\s\S]*background:\s*var\(--ink\);/u)
  assert.match(appCss, /\.badge\s*\{[\s\S]*width:\s*28px;[\s\S]*height:\s*28px;[\s\S]*background:\s*var\(--ink\);/u)
  assert.match(appCss, /\.icon-button-badge\s*\{[\s\S]*width:\s*18px;[\s\S]*min-width:\s*18px;[\s\S]*height:\s*18px;[\s\S]*background:\s*var\(--ink\);[\s\S]*font-size:\s*0\.68rem;/u)
  assert.match(appCss, /\.icon-button-badge\.icon-button-badge-wide\s*\{[\s\S]*min-width:\s*26px;[\s\S]*padding:\s*0 6px;/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.filter-badge,\s*[\s\S]*html\[data-theme='dark'\] \.icon-button-badge,\s*[\s\S]*html\[data-theme='dark'\] \.chat-topline-badge,\s*[\s\S]*html\[data-theme='dark'\] \.badge\s*\{[\s\S]*background:\s*rgba\(164,\s*91,\s*78,\s*0\.92\);[\s\S]*color:\s*#fff7f4;/u,
  )
  assert.match(appCss, /\.contact-request-card-icon\.incoming img/u)
  assert.match(appCss, /\.contact-request-card-icon\.outgoing img/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.contact-request-card-icon\.incoming img,\s*[\s\S]*\.contact-request-card-icon\.outgoing img\s*\{[\s\S]*filter:\s*var\(--icon-filter\);/u,
  )
  assert.match(handoffDoc, /contact links считаются server-authoritative direct contract/u)
  assert.match(handoffDoc, /карточка входящей заявки открывает общую direct-room/u)
  assert.match(handoffDoc, /карточка исходящей заявки тоже открывает общую direct-room/u)
  assert.match(handoffDoc, /открытие request-room из `Контактов` не должно переводить пользователя в `Диалоги`/u)
  assert.match(handoffDoc, /visual badge в `Контактах` не показываются/u)
  assert.match(handoffDoc, /верхние фильтры `Диалогов` тоже используют inline badge внутри кнопки/u)
  assert.match(handoffDoc, /badge у верхних вкладок `Контактов` прижимаются к правому краю кнопки, а иконка не сдвигается/u)
  assert.match(handoffDoc, /`Заявки` в разделе `Контакты` показывают только входящие pending requests/u)
  assert.match(handoffDoc, /`Отправленные запросы` показывают только исходящие pending requests/u)
  assert.match(handoffDoc, /`pending-outgoing` живёт только в комнате через нейтральную полноширинную кнопку `Отменить заявку`/u)
  assert.match(handoffDoc, /request-room open \/ accept \/ cancel \/ reject \/ block flow должен оставаться в отдельном contacts-specific client layer/u)
  assert.match(rolloutDoc, /контактные заявки — release-blocking контракт/u)
  assert.match(rolloutDoc, /badge у верхних tabs `Контактов` рендерятся внутри кнопки/u)
  assert.match(rolloutDoc, /badge у верхних tabs `Контактов` прижимаются к правому краю кнопки, а иконка не сдвигается/u)
  assert.match(rolloutDoc, /при `Тихо` visual badge у `Контактов` скрываются/u)
  assert.match(rolloutDoc, /верхние фильтры `Диалогов` используют inline badge внутри кнопки/u)
  assert.match(rolloutDoc, /открытие request-room из `Контактов` не должно переводить пользователя в `Диалоги`/u)
  assert.match(rolloutDoc, /empty-state секции `Заявки` = только технадпись `Заявок пока нет`/u)
  assert.match(rolloutDoc, /`Отправленные запросы` показывают только исходящие pending requests и скрываются, если список пуст/u)
  assert.match(rolloutDoc, /нижняя кнопка `Контакты` считает только входящие (pending requests|заявки)/u)
  assert.match(rolloutDoc, /pending request не создаёт чат у получателя/u)
  assert.match(rolloutDoc, /client-side contacts flow изолирован от общего chat-list UI/u)
})

test('accepted contact cards keep compact preview layout and lighter dark-theme surface', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const contactsPaneSource = readFileSync(join(repoRoot, 'src', 'components', 'ContactsPane.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(contactsPaneSource, /const latestMessage = chat\.messages\.at\(-1\)/u)
  assert.match(
    contactsPaneSource,
    /const chatPreview = chat\.messages\.length > 0 \? formatPreview\(chat\) : formatContactStatus\(chat\)/u,
  )
  assert.match(
    contactsPaneSource,
    /className=\{chat\.id === activeChatId \? 'chat-card contact-list-card active' : 'chat-card contact-list-card'\}/u,
  )
  assert.match(
    contactsPaneSource,
    /formatSidebarActivityLabel\(latestMessage\?\.createdAt, latestMessage\?\.time \?\? ''\)/u,
  )
  assert.match(contactsPaneSource, /<span className="chat-preview chat-status-preview">\{chatPreview\}<\/span>/u)
  assert.match(
    appCss,
    /\.contacts-section \.contact-list-card\s*\{[\s\S]*padding:\s*8px 12px 7px 10px;[\s\S]*gap:\s*9px;[\s\S]*border-radius:\s*18px;/u,
  )
  assert.match(appCss, /\.contacts-section \.contact-list-card \.chat-avatar-stack\s*\{[\s\S]*align-self:\s*center;/u)
  assert.match(appCss, /\.contacts-section \.contact-list-card \.chat-copy\s*\{[\s\S]*gap:\s*2px;/u)
  assert.match(
    appCss,
    /\.contacts-section \.contact-list-card \.avatar\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;[\s\S]*border-radius:\s*20px;/u,
  )
  assert.match(
    appCss,
    /\.contacts-section \.chat-card-request\.contact-list-card \.chat-card-request-main\s*\{[\s\S]*gap:\s*9px;[\s\S]*align-items:\s*center;/u,
  )
  assert.match(
    appCss,
    /\.contacts-section \.contact-request-card-action,\s*\n\.contacts-section \.contact-request-card-open\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.contacts-section \.contact-list-card\s*\{[\s\S]*background:\s*rgba\(40,\s*42,\s*50,\s*0\.98\);[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.contacts-section \.contact-list-card\.active\s*\{[\s\S]*background:\s*rgba\(52,\s*55,\s*65,\s*0\.98\);/u,
  )
})

test('quiet settings scene keeps category-specific notification contract wired through app, shared types and docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(sharedTypesSource, /export type SettingsView = 'profile' \| 'management' \| 'blocked' \| 'quiet' \| 'support' \| 'storage'/u)
  assert.match(sharedTypesSource, /export type QuietModeSettings = \{/u)
  assert.match(sharedTypesSource, /dialogs: boolean/u)
  assert.match(sharedTypesSource, /channels: boolean/u)
  assert.match(sharedTypesSource, /groups: boolean/u)
  assert.match(sharedTypesSource, /threads: boolean/u)
  assert.match(sharedTypesSource, /contactRequests: boolean/u)
  assert.match(sharedTypesSource, /autoInvisibility: boolean/u)
  assert.match(sharedBackendSource, /'quietModeSettings'/u)
  assert.match(sharedUtilsSource, /defaultQuietModeSettings/u)
  assert.match(sharedUtilsSource, /nonPremiumQuietModeSettings/u)
  assert.match(sharedUtilsSource, /normalizeQuietModeSettings/u)
  assert.match(sharedUtilsSource, /getEffectiveQuietModeSettings/u)
  assert.match(appSource, /quietModeSettingsOptions/u)
  assert.match(appSource, /Настройки режима "Тихо"/u)
  assert.match(appSource, /Уведомления диалогов/u)
  assert.match(appSource, /Уведомления каналов/u)
  assert.match(appSource, /Уведомления групп/u)
  assert.match(appSource, /Уведомления комментариев/u)
  assert.match(appSource, /Заявки от контактов/u)
  assert.match(appSource, /Авто-режим невидимки/u)
  assert.match(appSource, /Мы заботимся о том, чтобы вас не побеспокоила реклама или ненужные контакты/u)
  assert.match(appSource, /settings-copy settings-quiet-scene-copy/u)
  assert.match(appSource, /Режим заглушает:/u)
  assert.doesNotMatch(appSource, /Гибкая настройка уведомлений и авто-невидимки/u)
  assert.match(appSource, /Оформите подписку, чтобы открыть возможности детальной настройки режима/u)
  assert.match(appSource, /Приобрести подписку/u)
  assert.match(appSource, /settings-action-card settings-action-card-with-icon/u)
  assert.match(appSource, /<img src="\/icons\/quiet\.png" alt="" \/>/u)
  assert.match(appSource, /updateQuietModeSettingsPreference/u)
  assert.match(appSource, /effectiveQuietModeSettings\.autoInvisibility/u)
  assert.match(appSource, /quietContactRequestsSuppressed/u)
  assert.match(appSource, /quietDialogsSuppressed/u)
  assert.match(appSource, /quietChannelsSuppressed/u)
  assert.match(appSource, /quietGroupsSuppressed/u)
  assert.match(appSource, /quietThreadsSuppressed/u)
  assert.match(appSource, /shouldSuppressBrowserNotificationTarget/u)
  assert.match(storeSource, /getStoredQuietModeSettings/u)
  assert.match(storeSource, /payload\.quietModeSettings !== undefined/u)
  assert.match(storeSource, /resolveQuietModeInvisibilityState/u)
  assert.match(storeSource, /quiet-mode may auto-toggle invisibility/u)
  assert.match(storeSource, /quietModeSettings: getStoredQuietModeSettings\(account\)/u)
  assert.match(appCss, /\.settings-action-card-with-icon\s*\{/u)
  assert.match(appCss, /\.settings-action-card-icon\s*\{/u)
  assert.match(appCss, /\.settings-quiet-scene-copy\s*\{/u)
  assert.match(appCss, /\.settings-stack-quiet\s*\{/u)
  assert.match(appCss, /\.settings-quiet-section-title\s*\{/u)
  assert.match(appCss, /\.settings-item-quiet-option\s*\{/u)
  assert.match(appCss, /\.settings-quiet-intro\s*\{/u)
  assert.match(appCss, /\.settings-quiet-copy\s*\{/u)
  assert.match(appCss, /\.settings-quiet-upsell-button\s*\{/u)
  assert.match(appCss, /\.settings-checkbox input\[type='checkbox'\]\s*\{[\s\S]*appearance:\s*none;[\s\S]*display:\s*inline-grid;[\s\S]*border-radius:\s*11px;/u)
  assert.match(appCss, /\.settings-checkbox input\[type='checkbox'\]::after\s*\{[\s\S]*border-left:\s*2\.5px solid #ffffff;[\s\S]*border-bottom:\s*2\.5px solid #ffffff;[\s\S]*opacity:\s*0;/u)
  assert.match(appCss, /\.settings-checkbox input\[type='checkbox'\]:checked::after\s*\{[\s\S]*opacity:\s*1;[\s\S]*scale\(1\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-checkbox input\[type='checkbox'\]\s*\{[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.18\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.06\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-checkbox input\[type='checkbox'\]::after\s*\{[\s\S]*border-color:\s*#20242c;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-checkbox input\[type='checkbox'\]:checked\s*\{[\s\S]*border-color:\s*#d2d8e1;[\s\S]*background-color:\s*#bcc3cf;/u)
  assert.match(handoffDoc, /`Настройки режима "Тихо"` — отдельная settings-scene/u)
  assert.match(handoffDoc, /`quietModeSettings` хранится server-side/u)
  assert.match(handoffDoc, /чек-боксы quiet-settings управляют только visual badges и browser notifications/u)
  assert.match(handoffDoc, /`Авто-режим невидимки` управляет только авто-включением invisibility при нажатии `Тихо`/u)
  assert.match(handoffDoc, /без premium quiet-scene доступна, но детальные чек-боксы locked/u)
  assert.match(rolloutDoc, /quiet-settings сцена считается release-blocking контрактом/u)
  assert.match(rolloutDoc, /`quietModeSettings` должен нормализоваться к дефолтам/u)
  assert.match(rolloutDoc, /при non-premium первые пять чек-боксов визуально включены и locked/u)
  assert.match(rolloutDoc, /`Авто-режим невидимки` в non-premium сцене визуально выключен и locked/u)
})

test('browser notifications preference is server-side and mobile skips the promo banner in favor of one auto-request', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const browserNotificationsSource = readFileSync(join(repoRoot, 'src', 'app', 'browserNotifications.ts'), 'utf8')
  const browserNotificationsServiceWorkerSource = readFileSync(
    join(repoRoot, 'public', 'browser-notifications-sw.js'),
    'utf8',
  )
  const appStorageSource = readFileSync(join(repoRoot, 'src', 'app', 'storage.ts'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const appUtilsSource = readFileSync(join(repoRoot, 'src', 'app', 'utils.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(sharedTypesSource, /browserNotificationsEnabled\?: boolean/u)
  assert.match(sharedBackendSource, /'browserNotificationsEnabled'/u)
  assert.match(sharedUtilsSource, /export function isMobileBrowserEnvironment/u)
  assert.match(appUtilsSource, /isMobileBrowserEnvironment/u)
  assert.match(appStorageSource, /browserNotificationsEnabled: account\.browserNotificationsEnabled !== false/u)
  assert.match(appStorageSource, /browserNotificationsEnabled: parsed\.browserNotificationsEnabled !== false/u)
  assert.match(backendSource, /browserNotificationsEnabled: snapshot\.session\.browserNotificationsEnabled !== false/u)
  assert.match(storeSource, /browserNotificationsEnabled: legacyAccount\.browserNotificationsEnabled !== false/u)
  assert.match(storeSource, /browserNotificationsEnabled: true/u)
  assert.match(storeSource, /browserNotificationsEnabled: account\.browserNotificationsEnabled !== false/u)
  assert.match(storeSource, /payload\.browserNotificationsEnabled !== undefined/u)
  assert.match(appSource, /const mobileBrowserNotificationsEnabledByDefault =\s*Boolean\(session\) && isMobileBrowserEnvironment\(\) && browserNotificationsEnabled/u)
  assert.match(appSource, /const shouldAutoRequestBrowserNotificationsOnMobile =/u)
  assert.match(appSource, /!mobileBrowserNotificationsEnabledByDefault/u)
  assert.match(appSource, /mobileBrowserNotificationsAutoRequestAttemptedRef/u)
  assert.match(appSource, /requestBrowserNotificationsAccess\('mobile-auto-request'\)/u)
  assert.match(appSource, /void ensureBrowserNotificationDeliveryReady\(\)/u)
  assert.match(appSource, /tinychok\.browser-notification\.click/u)
  assert.match(appSource, /browserNotificationsDisabled = !browserNotificationsEnabled/u)
  assert.match(appSource, /browserNotificationsEnabled: enabled/u)
  assert.match(browserNotificationsSource, /const browserNotificationServiceWorkerPath = '\/browser-notifications-sw\.js'/u)
  assert.match(browserNotificationsSource, /updateViaCache:\s*'none'/u)
  assert.match(browserNotificationsSource, /navigator\.serviceWorker\.ready/u)
  assert.match(browserNotificationsSource, /renotify:\s*Boolean\(options\.tag\)/u)
  assert.match(browserNotificationsSource, /await registration\.showNotification\(title, notificationOptions\)/u)
  assert.match(browserNotificationsSource, /new window\.Notification\(title, notificationOptions\)/u)
  assert.match(browserNotificationsServiceWorkerSource, /self\.addEventListener\('notificationclick'/u)
  assert.match(browserNotificationsServiceWorkerSource, /self\.clients\.openWindow\(url\)/u)
  assert.match(browserNotificationsServiceWorkerSource, /tinychok\.browser-notification\.click/u)
  assert.match(handoffDoc, /on\/off preference хранится server-side/u)
  assert.match(handoffDoc, /mobile browser не должен показывать верхнюю promo-card-просьбу/u)
  assert.match(handoffDoc, /browser notifications сначала идут через `\/browser-notifications-sw\.js`/u)
  assert.match(handoffDoc, /updateViaCache: 'none'/u)
  assert.match(handoffDoc, /renotify/u)
  assert.match(rolloutDoc, /mobile не показывает promo-card/u)
  assert.match(rolloutDoc, /`browserNotificationsEnabled` хранится server-side/u)
  assert.match(rolloutDoc, /delivery сначала идёт через service worker `\/browser-notifications-sw\.js`/u)
  assert.match(rolloutDoc, /updateViaCache: 'none'/u)
  assert.match(rolloutDoc, /renotify/u)
})

test('profile settings fields keep lightweight label-and-input layout instead of large wrapper cards', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(appSource, /settings-stack settings-stack-profile/u)
  assert.match(appSource, /settings-item settings-item-profile-field/u)
  assert.match(appSource, /settings-item settings-item-profile-section-start/u)
  assert.match(appSource, /settings-action-card settings-action-card-with-icon settings-action-card-subtle settings-quiet-settings-button/u)
  assert.match(appCss, /\.settings-stack-profile\s*\{/u)
  assert.match(appCss, /\.settings-item-profile-field\s*\{/u)
  assert.match(appCss, /\.settings-item-profile-field \.settings-label\s*\{/u)
  assert.match(appCss, /\.settings-item-profile-field \.settings-input,\s*\n\.settings-item-profile-field \.settings-handle\s*\{/u)
  assert.match(appCss, /\.settings-item-profile-field \.handle-input\s*\{/u)
  assert.match(appCss, /\.settings-item-profile-section-start\s*\{/u)
  assert.match(appCss, /\.settings-profile-copy h2\s*\{/u)
  assert.match(appCss, /\.settings-profile-header\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*auto minmax\(0, 1fr\)/u)
  assert.match(appCss, /\.settings-stack-profile\s*\{\s*gap:\s*2px;/u)
  assert.match(appCss, /\.settings-item-profile-field \.settings-input,\s*\n\s*\.settings-item-profile-field \.settings-handle\s*\{\s*min-height:\s*56px;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-item-profile-field\s*\{[\s\S]*border-radius:\s*24px;[\s\S]*overflow:\s*hidden;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-item-profile-field \.settings-label\s*\{[\s\S]*padding-top:\s*8px;[\s\S]*padding-left:\s*12px;/u)
  assert.match(appCss, /@media \(max-width:\s*420px\)\s*\{[\s\S]*?\.settings-profile-copy h2\s*\{\s*font-size:\s*clamp\(0\.98rem,\s*4\.8vw,\s*1\.18rem\);/u)
  assert.match(appSource, /const adjustSettingsProfileNameFontSize = useCallback\(\(\) => \{[\s\S]*?nameNode\.style\.removeProperty\('font-size'\)[\s\S]*?const responsiveFontSize = Number\.parseFloat\(window\.getComputedStyle\(nameNode\)\.fontSize\)[\s\S]*?Math\.min\(accountNameMaxFontSize, responsiveFontSize\)/u)
  assert.match(appCss, /\.settings-action-card-subtle\s*\{/u)
  assert.match(appCss, /\.settings-quiet-settings-button\s*\{/u)
  assert.match(releaseDoc, /profile-scene на узком mobile не должен ронять avatar и display name в две отдельные вертикальные колонки/u)
  assert.match(releaseDoc, /узкий breakpoint `<=420px` не должен снова раздувать profile headline общим `\.settings-heading h2`/u)
  assert.match(releaseDoc, /runtime autosize profile headline не должен стартовать с desktop `30\.4px`, если mobile CSS уже задал меньший baseline/u)
  assert.match(rolloutDoc, /profile settings mobile smoke/u)
  assert.match(rolloutDoc, /узкий mobile breakpoint не должен перетирать compact profile headline общим `\.settings-heading h2`/u)
  assert.match(rolloutDoc, /inline autosize profile headline должен уважать текущий mobile font-size из CSS/u)
  assert.match(handoffDoc, /profile-scene mobile contract/u)
  assert.match(handoffDoc, /на `<=420px` profile headline должен переопределяться после общего `\.settings-heading h2`/u)
  assert.match(handoffDoc, /settings profile autosize обязан стартовать от текущего computed mobile font-size/u)
})

test('support chat contract stays wired through app, store, admin surface and docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const adminSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const adminCss = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const threadFlowSource = readFileSync(join(repoRoot, 'src', 'app', 'useThreadFlow.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const indexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const adminRoutesSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-routes.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(sharedTypesSource, /export type SupportTicketComment = ThreadComment/u)
  assert.match(sharedTypesSource, /export type SupportTicketStatus = 'open' \| 'needs_confirmation' \| 'resolved' \| 'reopened'/u)
  assert.match(sharedTypesSource, /export type SupportTicket = \{/u)
  assert.match(sharedTypesSource, /status: SupportTicketStatus/u)
  assert.match(sharedBackendSource, /export type AdminSupportTicketStatus = SupportTicket\['status'\] \| 'new'/u)
  assert.match(sharedBackendSource, /status: SupportTicket\['status'\]/u)
  assert.match(sharedBackendSource, /AdminSupportTicketReplyBody = \{[\s\S]*attachment\?: MessageAttachment[\s\S]*clientDeliveryId\?: string[\s\S]*replyTo\?: Message\['replyTo'\][\s\S]*status: SupportTicket\['status'\]/u)
  assert.match(sharedUtilsSource, /adminSupportTicketStatusOptions/u)
  assert.match(sharedUtilsSource, /formatAdminSupportTicketStatus/u)
  assert.match(sharedUtilsSource, /getAdminSupportTicketStatusSortOrder/u)
  assert.match(sharedUtilsSource, /supportTicketStatusOptions/u)
  assert.match(sharedUtilsSource, /formatSupportTicketCreatedAt/u)
  assert.match(sharedUtilsSource, /formatSupportTicketStatus/u)
  assert.match(sharedUtilsSource, /getSupportTicketStatusSortOrder/u)
  assert.match(sharedTypesSource, /export type SettingsView = 'profile' \| 'management' \| 'blocked' \| 'quiet' \| 'support' \| 'storage'/u)
  assert.match(threadFlowSource, /kind: 'support'/u)
  assert.match(threadFlowSource, /ticketId: number/u)
  assert.match(appSource, /Написать в поддержку/u)
  assert.match(appSource, /supportInfoBannerText/u)
  assert.match(appSource, /supportCooldownCopy/u)
  assert.match(appSource, /supportCooldownErrorMessage/u)
  assert.match(appSource, /supportComposerCooldownUntil/u)
  assert.match(appSource, /resolveSupportCooldownUntilFromTickets/u)
  assert.match(appSource, /effectiveSupportTicketCooldownUntil/u)
  assert.doesNotMatch(appSource, /supportCooldownLabel/u)
  assert.doesNotMatch(appSource, /settings-support-cooldown-timer/u)
  assert.match(appSource, /settingsView === 'support'/u)
  assert.match(appSource, /<p className="settings-copy settings-support-scene-copy">\s*\{supportInfoBannerText\}/u)
  assert.match(appSource, /Ваши тикеты/u)
  assert.match(appSource, /Дата и время создания/u)
  assert.match(appSource, /formatSupportTicketCreatedAt\(ticket\.createdAt\)/u)
  assert.match(appSource, /supportSceneTopRef/u)
  assert.match(appSource, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/u)
  assert.match(appSource, /Наверх/u)
  assert.match(appSource, /support-ticket-status-badge/u)
  assert.match(appSource, /formatSupportTicketStatus\(ticket\.status\)/u)
  assert.match(appSource, /formatSupportTicketStatus\(activeSupportTicket\.status\)/u)
  assert.match(appSource, /sendSupportTicketRequest/u)
  assert.match(appSource, /if \(supportCooldownActive\) \{\s*setSupportError\(''\)\s*return/u)
  assert.match(appSource, /response\.snapshot\.supportTicketCooldownUntil \?\?[\s\S]{0,120}resolveSupportCooldownUntilFromTickets\(response\.snapshot\.supportTickets\)/u)
  assert.match(appSource, /const localCooldownUntil = new Date\(Date\.now\(\) \+ supportTicketCooldownMs\)\.toISOString\(\)/u)
  assert.match(appSource, /setSupportComposerCooldownUntil\(nextCooldownUntil\)/u)
  assert.match(appSource, /setSupportTicketCooldownUntil\(nextCooldownUntil\)/u)
  assert.match(appSource, /errorMessage === supportCooldownErrorMessage/u)
  assert.match(appSource, /new Date\(Date\.now\(\) \+ supportTicketCooldownMs\)\.toISOString\(\)/u)
  assert.match(appSource, /setSupportComposerCooldownUntil\(fallbackCooldownUntil\)/u)
  assert.match(appSource, /setSupportTicketCooldownUntil\(fallbackCooldownUntil\)/u)
  assert.match(appSource, /supportError && supportError !== supportCooldownErrorMessage/u)
  assert.match(appSource, /if \(effectiveSupportTicketCooldownUntil\) \{\s*return\s*\}[\s\S]{0,220}resolveSupportCooldownUntilFromTickets\(supportTickets, supportCooldownNow\)/u)
  assert.match(appSource, /sendSupportTicketCommentRequest/u)
  assert.match(appSource, /markSupportTicketReadRequest/u)
  assert.match(appSource, /function applyLocalSupportTicketRead\(ticketId: number\)/u)
  assert.match(appSource, /setSupportUnreadCount\(\(currentUnreadCount\) => Math\.max\(0, currentUnreadCount - unreadCount\)\)/u)
  assert.match(appSource, /target\.kind === 'support'[\s\S]{0,160}applyLocalSupportTicketRead\(target\.ticketId\)/u)
  assert.match(appSource, /openSupportTicketThread/u)
  assert.match(appSource, /opening a support ticket must only open its thread/u)
  assert.match(appSource, /Support room lives only inside settings/u)
  assert.match(appSource, /const isSupportSettingsThreadOpen =\s*isSettingsView && settingsView === 'support' && threadTarget\?\.kind === 'support'/u)
  assert.match(appSource, /isSupportSettingsThreadOpen \? 'shell-support-thread-open' : ''/u)
  assert.match(appSource, /isSupportSettingsThreadOpen\s*\?\s*'stage settings-thread-open'/u)
  assert.match(appSource, /room-thread\$\{isSupportSettingsThreadOpen \? ' room-thread-settings' : ''\}/u)
  assert.match(appSource, /isSettingsView && !isSupportSettingsThreadOpen \? \(/u)
  assert.match(appSource, /threadTarget && \(threadTarget\.kind !== 'support' \|\| isSupportSettingsThreadOpen\) \?/u)
  assert.match(appSource, /settings-actions-support-scene/u)
  assert.match(appSource, /settingsView !== 'support' \? \(/u)
  assert.match(appSource, /settings-support-ticket-section-title/u)
  assert.match(appSource, /settings-support-ticket-bubble"[\s\S]{0,520}onClick=\{\(\) => openSupportTicketThread\(ticket\.id\)\}/u)
  assert.match(appSource, /settings-support-ticket-bubble"[\s\S]{0,320}role="button"/u)
  assert.match(appSource, /attachmentModes=\{threadTarget\.kind === 'support' \? \['photo'\] : undefined\}/u)
  assert.match(appSource, /showEmojiPicker=\{threadTarget\.kind !== 'support'\}/u)
  assert.match(appSource, /className="settings-item settings-support-composer"/u)
  assert.match(appSource, /attachmentModes=\{\['photo'\]\}/u)
  assert.match(appSource, /showEmojiPicker=\{false\}/u)
  assert.match(appCss, /\.settings-stack-support\s*\{/u)
  assert.match(appCss, /\.shell-support-thread-open\s*\{/u)
  assert.match(appCss, /\.stage\.settings-thread-open\s*\{/u)
  assert.match(appCss, /\.room-thread-settings\s*\{/u)
  assert.match(appCss, /\.settings-actions-support-scene\s*\{/u)
  assert.match(appCss, /\.settings-support-ticket-item \.threaded-bubble/u)
  assert.match(appCss, /\.settings-support-ticket-bubble:focus-visible\s*\{/u)
  assert.match(appCss, /\.settings-support-ticket-created-at-label\s*\{/u)
  assert.match(appCss, /\.settings-support-scroll-top-button\s*\{/u)
  assert.match(appCss, /\.settings-support-ticket-section-title\s*\{/u)
  assert.doesNotMatch(appSource, /settings-support-info-card/u)
  assert.match(appCss, /\.settings-support-cooldown-card,\s*\n\.settings-support-empty-state,\s*\n\.settings-support-composer/u)
  assert.doesNotMatch(appCss, /\.settings-support-cooldown-timer\s*\{/u)
  assert.match(appCss, /\.composer\.settings-item\.settings-support-composer\s*\{[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;/u)
  assert.match(appCss, /\.settings-support-composer textarea\s*\{[\s\S]*min-height:\s*124px;[\s\S]*padding:\s*16px 76px 16px 18px;/u)
  assert.match(appCss, /\.settings-support-composer \.composer-tools\s*\{[\s\S]*right:\s*14px;/u)
  assert.match(appCss, /\.settings-support-composer \.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\) \.composer-tools\s*\{[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/u)
  assert.match(appCss, /\.settings-support-composer \.composer-field\.composer-field-expanded \.composer-tools,\s*\n\.settings-support-composer \.composer-field\.composer-field-has-attachment \.composer-tools\s*\{[\s\S]*bottom:\s*14px;[\s\S]*transform:\s*none;/u)
  assert.match(appCss, /@media[\s\S]*\.settings-support-composer textarea\s*\{[\s\S]*min-height:\s*124px;[\s\S]*padding:\s*16px 76px 16px 18px;/u)
  assert.match(appCss, /@media[\s\S]*\.settings-support-composer \.composer-tools\s*\{[\s\S]*right:\s*14px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.composer textarea\s*\{[\s\S]*padding:\s*13px 126px 16px 14px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.composer-tools\s*\{[\s\S]*right:\s*7px;[\s\S]*gap:\s*6px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.composer textarea\s*\{[\s\S]*padding:\s*13px 116px 16px 14px;/u)
  assert.match(appCss, /\.support-ticket-status-badge-resolved/u)
  assert.match(appCss, /\.settings-support-chat-button\s*\{/u)
  assert.match(appCss, /\.settings-support-chat-badge\s*\{[^}]*position:\s*static;/u)
  assert.match(appSource, /aria-label="Настройки"/u)
  assert.match(appSource, /Keep support unread mirrored on the settings launcher/u)
  assert.match(appSource, /supportUnreadCount > 0/u)
  assert.match(appSource, /icon-button-badge/u)
  assert.match(appSource, /supportUnreadCount > 9 \? 'icon-button-badge icon-button-badge-wide' : 'icon-button-badge'/u)
  assert.match(adminSource, /section === 'support'/u)
  assert.match(adminSource, /fetchAdminSupportTickets/u)
  assert.match(adminSource, /fetchAdminSupportTicket/u)
  assert.match(adminSource, /replyAdminSupportTicket/u)
  assert.match(adminSource, /const \[supportFilter, setSupportFilter\] = useState<AdminSupportFilter>\('all'\)/u)
  assert.match(adminSource, /const supportNewTicketCount = supportTickets\.filter\(\(ticket\) => ticket\.status === 'new'\)\.length/u)
  assert.match(adminSource, /const filteredSupportTickets =/u)
  assert.match(adminSource, /supportFilterOptions/u)
  assert.match(adminSource, /item === 'support' && supportNewTicketCount > 0/u)
  assert.match(adminSource, /support-filter-\$\{filter\.value\}/u)
  assert.match(adminSource, /setSupportFilter\(filter\.value\)/u)
  assert.match(adminSource, /filteredSupportTickets\.map\(\(ticket\) => \(/u)
  assert.match(adminSource, /supportReplyStatus/u)
  assert.match(adminSource, /formatAdminSupportTicketStatus/u)
  assert.match(adminSource, /supportTicketStatusOptions/u)
  assert.match(adminSource, /status: supportReplyStatus/u)
  assert.match(adminSource, /selectedSupportTicket\.status === 'new' \? 'open' : selectedSupportTicket\.status/u)
  assert.match(adminSource, /<dt>Статус<\/dt>/u)
  assert.match(adminSource, /separate from moderation complaints and from user dialogs/u)
  assert.match(adminCss, /\.admin-textarea\s*\{/u)
  assert.match(adminCss, /\.admin-filter-count\s*\{/u)
  assert.match(adminCss, /\.admin-filter-tab\.active \.admin-filter-count\s*\{/u)
  assert.match(adminCss, /\.admin-support-status-badge-new/u)
  assert.match(adminCss, /\.admin-support-status-badge-resolved/u)
  assert.match(storeSource, /SUPPORT_TICKET_COOLDOWN_MS = 10 \* 60 \* 1000/u)
  assert.match(storeSource, /nextSupportTicketNumber/u)
  assert.match(storeSource, /materializeSupportTickets/u)
  assert.match(storeSource, /openedByStaffAt\?: string/u)
  assert.match(storeSource, /sanitizeSupportTicketStatus/u)
  assert.match(storeSource, /getAdminSupportTicketDisplayStatus/u)
  assert.match(storeSource, /ticket\.openedByStaffAt = new Date\(\)\.toISOString\(\)/u)
  assert.match(storeSource, /ticket\.status = status/u)
  assert.match(storeSource, /getAdminSupportTicketStatusSortOrder/u)
  assert.match(storeSource, /root support messages create standalone globally numbered tickets/u)
  assert.match(storeSource, /Staff replies stay inside the ticket thread/u)
  assert.match(indexSource, /\/api\/support\/tickets/u)
  assert.match(indexSource, /\/api\/support\/tickets\/:ticketId\/comments/u)
  assert.match(indexSource, /\/api\/support\/tickets\/:ticketId\/read/u)
  assert.match(indexSource, /getNonNegativeNumericRouteParam/u)
  assert.match(adminRoutesSource, /\/api\/admin\/support-tickets/u)
  assert.match(handoffDoc, /`Написать в поддержку` живёт только внутри `Настроек`/u)
  assert.match(handoffDoc, /root message в support-room создаёт отдельный тикет/u)
  assert.match(handoffDoc, /cooldown `10 минут`/u)
  assert.match(handoffDoc, /ответы живут исключительно в комментариях/u)
  assert.match(handoffDoc, /новый тикет всегда стартует со статусом `Открыт`/u)
  assert.match(handoffDoc, /`Новое` в admin queue/u)
  assert.match(handoffDoc, /комментарий пользователя сам по себе не меняет статус тикета/u)
  assert.match(rolloutDoc, /### Support Chat/u)
  assert.match(rolloutDoc, /support-room не появляется в обычных `Диалогах`/u)
  assert.match(rolloutDoc, /отправка root message создаёт `Тикет #N`/u)
  assert.match(rolloutDoc, /показывается как `Новое`/u)
  assert.match(rolloutDoc, /сразу второй root-ticket отправить нельзя/u)
  assert.match(rolloutDoc, /`Решён` у пользователя виден зелёной плашкой/u)
})

test('scene-open composer autofocus stays desktop-only across direct, group, channel, thread and support flows', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const appUtilsSource = readFileSync(join(repoRoot, 'src', 'app', 'utils.ts'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(sharedUtilsSource, /export function isMobileBrowserEnvironment\(\)/u)
  assert.match(sharedUtilsSource, /export function shouldAutoFocusTextInputOnSceneOpen\(\)\s*\{\s*return !isMobileBrowserEnvironment\(\)\s*\}/u)
  assert.match(appUtilsSource, /shouldAutoFocusTextInputOnSceneOpen/u)
  assert.match(directRoomSource, /if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return[\s\S]*draftInputRef\.current\?\.focus\(\)/u)
  assert.match(groupRoomSource, /if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return[\s\S]*draftInputRef\.current\?\.focus\(\)/u)
  assert.match(channelRoomSource, /if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return[\s\S]*publisherInputRef\.current\?\.focus\(\)/u)
  assert.match(appSource, /if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return[\s\S]*threadComposerInputRef\.current\?\.focus\(\)/u)
  assert.match(appSource, /if \(!shouldAutoFocusTextInputOnSceneOpen\(\)\) return[\s\S]*supportComposerInputRef\.current\?\.focus\(\)/u)
  assert.match(rolloutDoc, /mobile browser scene-open contract: dialog, group, channel, thread и support composer не должны автозахватывать фокус при входе в экран/u)
  assert.match(handoffDoc, /`shouldAutoFocusTextInputOnSceneOpen\(\)` — единый guard для scene-open autofocus/u)
})

test('self presence and invisibility contract stay wired through app, css and docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const appStorageSource = readFileSync(join(repoRoot, 'src', 'app', 'storage.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const indexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.match(appSource, /const selfPresenceIndicatorMode/u)
  assert.match(appSource, /const invisibilityPreferenceEnabled/u)
  assert.match(appSource, /const invisibilityAutoEnabled/u)
  assert.match(appSource, /const invisibilityModeActive/u)
  assert.match(appSource, /setInvisibilityPreference/u)
  assert.match(appSource, /resolveQuietModeInvisibilityState/u)
  assert.match(appSource, /Режим невидимки/u)
  assert.match(appSource, /openPremiumUpsell/u)
  assert.match(appSource, /settings-item settings-item-invisibility/u)
  assert.match(appSource, /settings-invisibility-button/u)
  assert.match(appSource, /settings-invisibility-crown/u)
  assert.match(appSource, /Режим невидимки доступен в премиуме/u)
  assert.match(appSource, /the settings checkbox must never locally fake-enable invisible mode for free users/u)
  assert.match(appSource, /self-presence-avatar-stack account-avatar/u)
  assert.match(appSource, /self-presence-indicator invisible/u)
  assert.match(appCss, /\.self-presence-avatar-stack\s*\{/u)
  assert.match(appCss, /\.self-presence-indicator\s*\{/u)
  assert.match(appCss, /\.self-presence-indicator\.invisible\s*\{/u)
  assert.match(appCss, /\.settings-invisibility-button\s*\{/u)
  assert.match(appCss, /\.settings-invisibility-title\s*\{/u)
  assert.match(appCss, /radial-gradient\(circle at center, transparent/u)
  assert.match(sharedTypesSource, /invisibilityAutoEnabled\?: boolean/u)
  assert.match(sharedUtilsSource, /export function resolveQuietModeInvisibilityState/u)
  assert.match(appStorageSource, /invisibilityAutoEnabled: Boolean\(account\.invisibilityAutoEnabled\)/u)
  assert.match(appStorageSource, /invisibilityAutoEnabled: Boolean\(parsed\.invisibilityAutoEnabled\)/u)
  assert.match(storeSource, /function getStoredInvisibilityPreference/u)
  assert.match(storeSource, /function isInvisibleModeActive/u)
  assert.match(storeSource, /function shouldHidePresenceFromOthers/u)
  assert.match(storeSource, /function shouldSuppressDirectReadReceipts/u)
  assert.match(storeSource, /Presence source of truth:/u)
  assert.match(storeSource, /Persisted database\.sessions are allowed to[\s\S]*outlive the browser/u)
  assert.match(storeSource, /logoutCurrentSession/u)
  assert.match(storeSource, /markSessionLive/u)
  assert.match(storeSource, /markSessionOffline/u)
  assert.match(storeSource, /Once `invisibilityEnabled` is persisted, it becomes the single source/u)
  assert.match(storeSource, /account\.invisibilityAutoEnabled = false/u)
  assert.match(storeSource, /resolveQuietModeInvisibilityState/u)
  assert.match(storeSource, /Keep this delegating through isInvisibleModeActive/u)
  assert.match(storeSource, /Direct read-receipt stealth must follow the exact same gate as invisible mode itself/u)
  assert.match(storeSource, /function getViewerVisibleOnline/u)
  assert.match(storeSource, /Active invisible mode hides live presence from other viewers everywhere/u)
  assert.match(storeSource, /must not leak direct read receipts to the peer/u)
  assert.match(storeSource, /Keep this coupled to shouldSuppressDirectReadReceipts/u)
  assert.match(appSource, /Do not mirror this condition into chat\/contact presence lists; those must stay server-authoritative/u)
  assert.match(appSource, /logoutSessionRequest/u)
  assert.match(appSource, /local storage cleanup alone must never be the only logout step/u)
  assert.match(backendSource, /makeHttpUrl\('\/api\/logout'\)/u)
  assert.match(indexSource, /app\.post\('\/api\/logout'/u)
  assert.match(indexSource, /broadcastPresenceChangesForToken/u)
  assert.match(storeSource, /materializeGroup\(\s*database: Database,\s*livePresenceIdentifiers: LivePresenceLookup,\s*viewerIdentifier: string,/u)
  assert.match(handoffDoc, /эта механика считается release-blocking/u)
  assert.match(handoffDoc, /`Режим невидимки` — отдельная server-side premium-настройка `invisibilityEnabled`/u)
  assert.match(handoffDoc, /это одна из главных premium\/quiet-механик продукта/u)
  assert.match(handoffDoc, /в настройках под `Выключить браузерные уведомления` должен оставаться отдельный блок/u)
  assert.match(handoffDoc, /кнопка `Тихо` для premium-пользователя при каждом новом включении должна автоматически выставлять `invisibilityEnabled=true`/u)
  assert.match(handoffDoc, /auto-enabled самим `Тихо`, fresh `Тихо -> off` обязан автоматически вернуть `invisibilityEnabled=false`/u)
  assert.match(handoffDoc, /включена вручную отдельным чек-боксом/u)
  assert.match(handoffDoc, /внутренний provenance-флаг `invisibilityAutoEnabled` допустим только как память/u)
  assert.match(handoffDoc, /второму участнику нельзя зеркалить `readAt`/u)
  assert.match(handoffDoc, /invisibility и one-tick behavior нельзя разводить разными product-facing флагами или client-only условиями/u)
  assert.match(handoffDoc, /сам пользователь в своих двух шапках должен видеть серый ring-dot `Невидимка`/u)
  assert.match(handoffDoc, /source of truth только live realtime\/websocket presence/u)
  assert.match(handoffDoc, /`logout` обязан делать server-side invalidation текущего token через `\/api\/logout`/u)
  assert.match(rolloutDoc, /`Режим невидимки` считается release-blocking presence-контрактом/u)
  assert.match(rolloutDoc, /это одна из главных premium\/quiet-механик/u)
  assert.match(rolloutDoc, /auto-enabled самим `Тихо`, выход из `Тихо` обязан автоматически выключать её обратно/u)
  assert.match(rolloutDoc, /включена вручную в настройках, выход из `Тихо` не должен её выключать/u)
  assert.match(rolloutDoc, /внутренний provenance-флаг допустим только для памяти об auto-enabled origin/u)
  assert.match(rolloutDoc, /в настройках под `Выключить браузерные уведомления` должен быть отдельный блок `Режим невидимки`/u)
  assert.match(rolloutDoc, /тап по `Режиму невидимки` без premium должен вести в premium-экран/u)
  assert.match(rolloutDoc, /отправитель не должен получать `readAt`/u)
  assert.match(rolloutDoc, /regressions по presence и direct read-receipts обязательны/u)
  assert.match(rolloutDoc, /другие пользователи должны видеть такой аккаунт полностью как офлайн/u)
  assert.match(rolloutDoc, /обычный `В сети` тоже держим как release-blocking контракт/u)
  assert.match(rolloutDoc, /persisted `sessions` и retention cleanup не могут сами по себе держать пользователя online/u)
  assert.match(releaseDoc, /fresh `Тихо -> on` при `autoInvisibility=true`/u)
  assert.match(releaseDoc, /fresh `Тихо -> off`:/u)
  assert.match(releaseDoc, /не должен выключать вручную включённую `Невидимку`/u)
})

test('group creation limit follows active tariff groups only', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const freeOwner = createAccount('+79990210001')
  const premiumOwner = createAccount('+79990210002', {
    premium: true,
    premiumExpiresAt: daysFromNow(30),
  })
  const foreignOwner = createAccount('+79990210004', {
    premium: true,
    premiumExpiresAt: daysFromNow(30),
  })
  const peer = createAccount('+79990210003')

  database.accounts.push(freeOwner, premiumOwner, foreignOwner, peer)

  const freeToken = createSession(database, freeOwner.identifier, 'free-group-limit')
  const premiumToken = createSession(database, premiumOwner.identifier, 'premium-group-limit')
  const foreignToken = createSession(database, foreignOwner.identifier, 'foreign-group-limit')
  const peerToken = createSession(database, peer.identifier, 'peer-group-limit')

  seedAcceptedContactLink(database, freeOwner.identifier, peer.identifier)
  seedAcceptedContactLink(database, premiumOwner.identifier, peer.identifier)
  seedAcceptedContactLink(database, foreignOwner.identifier, premiumOwner.identifier)

  const freeDialog = await store.openDirectDialog(freeToken, { identifier: peer.identifier })
  await store.openDirectDialog(peerToken, { identifier: freeOwner.identifier })
  const premiumDialog = await store.openDirectDialog(premiumToken, { identifier: peer.identifier })
  const foreignInviteDialog = await store.openDirectDialog(foreignToken, { identifier: premiumOwner.identifier })

  for (let index = 0; index < 5; index += 1) {
    await store.createGroup(freeToken, {
      memberDialogIds: [freeDialog.dialogId],
      title: `Free ${index + 1}`,
    })
  }

  await assert.rejects(
    () =>
      store.createGroup(freeToken, {
        memberDialogIds: [freeDialog.dialogId],
        title: 'Free overflow',
      }),
    /На бесплатном аккаунте можно создать только 5 групп/u,
  )

  const firstFreeGroupId = store.getSnapshotByToken(freeToken)?.groups[0]?.id
  assert.ok(firstFreeGroupId)
  await store.leaveGroup(freeToken, firstFreeGroupId!)

  await assert.doesNotReject(() =>
    store.createGroup(freeToken, {
      memberDialogIds: [freeDialog.dialogId],
      title: 'Free after archive',
    }),
  )

  for (let index = 0; index < 7; index += 1) {
    await store.createGroup(foreignToken, {
      memberDialogIds: [foreignInviteDialog.dialogId],
      title: `Foreign ${index + 1}`,
    })

    const invitationMessage = [...database.dialogMessages]
      .reverse()
      .find(
        (message) =>
          message.ownerIdentifier === premiumOwner.identifier &&
          message.sourceGroup?.sharedId,
      )
    assert.ok(invitationMessage?.sourceGroup?.sharedId)
    await store.joinGroupBySharedId(premiumToken, invitationMessage!.sourceGroup!.sharedId!)
  }

  const premiumMemberOnlySnapshot = store.getSnapshotByToken(premiumToken)
  assert.equal(
    premiumMemberOnlySnapshot?.groups.filter((group) => group.viewerIsOwner).length,
    0,
  )

  for (let index = 0; index < 20; index += 1) {
    await store.createGroup(premiumToken, {
      memberDialogIds: [premiumDialog.dialogId],
      title: `Premium ${index + 1}`,
    })
  }

  await assert.rejects(
    () =>
      store.createGroup(premiumToken, {
        memberDialogIds: [premiumDialog.dialogId],
        title: 'Premium overflow',
      }),
    /Даже с премиумом можно создать не больше 20 активных групп/u,
  )
})

test('premium storage quotas stay sticky after downgrade and for expired premium restored from persisted state', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const premiumAccount = createAccount('+79990210011', {
    premium: true,
    premiumExpiresAt: daysFromNow(30),
  })
  database.accounts.push(premiumAccount)
  const token = createSession(database, premiumAccount.identifier, 'premium-storage-sticky')

  const downgradeResult = await store.setDebugPremiumState(token, {
    durationDays: 30,
    enabled: false,
  })
  assert.equal(downgradeResult.snapshot.session.premium, false)
  assert.equal(downgradeResult.snapshot.session.storageUsage?.quotaBytes, premiumStorageQuotaBytes)

  const downgradedAdminUser = store.adminGetUser(premiumAccount.identifier).user
  assert.equal(downgradedAdminUser.archiveStorageUsage?.quotaBytes, premiumArchiveStorageQuotaBytes)

  const downgradedAccount = database.accounts.find((account) => account.identifier === premiumAccount.identifier)
  assert.equal(downgradedAccount?.retainedStorageQuotaBytes, premiumStorageQuotaBytes)
  assert.equal(downgradedAccount?.retainedArchiveStorageQuotaBytes, premiumArchiveStorageQuotaBytes)

  const expiredPremiumAccount = {
    ...createAccount('+79990210012', {
      premium: true,
      premiumExpiresAt: '2026-03-01T00:00:00.000Z',
    }),
    retainedArchiveStorageQuotaBytes: undefined,
    retainedStorageQuotaBytes: undefined,
  }
  const { database: restoredDatabase } = coerceDatabasePayload({
    accounts: [expiredPremiumAccount],
  })
  const restoredStore = TinychokStore.create(restoredDatabase, async () => undefined)
  const restoredToken = createSession(restoredDatabase, expiredPremiumAccount.identifier, 'expired-premium-storage-sticky')
  const restoredSnapshot = restoredStore.getSnapshotByToken(restoredToken)
  assert.ok(restoredSnapshot)
  assert.equal(restoredSnapshot?.session.storageUsage?.quotaBytes, premiumStorageQuotaBytes)

  const restoredAdminUser = restoredStore.adminGetUser(expiredPremiumAccount.identifier).user
  assert.equal(restoredAdminUser.archiveStorageUsage?.quotaBytes, premiumArchiveStorageQuotaBytes)

  const restoredAccount = restoredDatabase.accounts.find(
    (account: { identifier: string }) => account.identifier === expiredPremiumAccount.identifier,
  )
  assert.equal(restoredAccount?.retainedStorageQuotaBytes, premiumStorageQuotaBytes)
  assert.equal(restoredAccount?.retainedArchiveStorageQuotaBytes, premiumArchiveStorageQuotaBytes)
})

test('sticky premium storage retention stays explicit in source and docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(storeSource, /retainedStorageQuotaBytes/u)
  assert.match(storeSource, /retainedArchiveStorageQuotaBytes/u)
  assert.match(storeSource, /rememberUnlockedPremiumStorageQuota/u)
  assert.match(storeSource, /Once a user unlocks premium storage, don't shrink the quota back on expiry\./u)
  assert.match(storeSource, /getEffectiveUserStorageQuotaBytes/u)
  assert.match(storeSource, /getEffectiveUserArchiveStorageQuotaBytes/u)
  assert.match(releaseDoc, /истечение premium не должно сжимать user storage quota назад/u)
  assert.match(rolloutDoc, /premium истёк, а пользователь раньше уже получил premium storage, квота назад не сжимается/u)
  assert.match(handoffDoc, /если premium истёк после активного premium-периода, user storage quota и archive quota не должны сжиматься назад до free/u)
})

test('premium screen and create-group modal keep tariff group-count copy wired', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const constantsSource = readFileSync(join(repoRoot, 'src', 'shared', 'constants.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(constantsSource, /export const defaultGroupsPerUserLimit = 5/u)
  assert.match(constantsSource, /export const premiumGroupsPerUserLimit = 20/u)
  assert.match(appSource, /До 20 групп вместо 5 на бесплатном аккаунте/u)
  assert.match(appSource, /Загрузка своих GIF animation/u)
  assert.doesNotMatch(appSource, /Загрузка и использование GIF animation/u)
  assert.match(appSource, /На бесплатном аккаунте можно создать до/u)
  assert.match(appSource, /С премиумом можно создать до/u)
  assert.match(appSource, /Открыть премиум/u)
  assert.match(appCss, /\.group-create-limit-upsell\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*gap:\s*10px;/u)
  assert.match(appCss, /\.group-create-limit-upsell \.premium-crown img\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/u)
  assert.match(appCss, /\.premium-gift-title img\s*\{[\s\S]*width:\s*22px;[\s\S]*height:\s*22px;/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.group-create-limit-upsell \.premium-crown img,\s*[\s\S]*html\[data-theme='dark'\] \.premium-gift-title img,\s*[\s\S]*html\[data-theme='dark'\] \.premium-crown img \{\s*filter:\s*var\(--icon-filter\);/u,
  )
  assert.match(appCss, /\.group-create-limit-upsell > span:last-child\s*\{[\s\S]*line-height:\s*1;/u)
  assert.match(appSource, /defaultGroupsPerUserLimit/u)
  assert.match(appSource, /getGroupCreationLimitError/u)
  assert.match(appSource, /group\.viewerIsOwner !== undefined/u)
  assert.ok(!/const activeOwnedGroupCount = groups\.length/u.test(appSource))
  assert.match(storeSource, /Tariff limit for active owner groups is server-authoritative/u)
  assert.match(storeSource, /getCurrentGroupOwnerIdentifier\(group\) === account\.identifier/u)
  assert.match(storeSource, /new Set\(/u)
  assert.match(storeSource, /this\.getSharedGroupId\(group\)/u)
  assert.match(storeSource, /viewerIsOwner: getCurrentGroupOwnerIdentifier\(group\) === viewerIdentifier/u)
  assert.match(storeSource, /activeOwnedGroupCount >= groupsPerUserLimit/u)
  assert.match(
    storeSource,
    /На бесплатном аккаунте можно создать только \$\{defaultGroupsPerUserLimit\} групп\. Чтобы создать больше, активируйте премиум\./u,
  )
})

test('create-group modal explains missing members on submit and keeps the picker right above the action buttons', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /const creatingGroupSelectionRequiredMessage =/u)
  assert.match(appSource, /Сначала добавьте хотя бы один контакт, чтобы создать группу\./u)
  assert.match(appSource, /Чтобы создать группу, добавьте хотя бы одного человека кроме себя\./u)
  assert.match(appSource, /if \(!canCreateGroup\) \{\s*setCreatingGroupSelectionHint\(creatingGroupSelectionRequiredMessage\)/u)
  assert.match(
    appSource,
    /group-create-limit-card[\s\S]*<span className="settings-label">Добавить участников<\/span>[\s\S]*room-confirm-actions room-confirm-actions-dual/u,
  )
  assert.match(appSource, /aria-disabled=\{creatingGroupBusy \|\| creatingGroupLimitReached\}/u)
  assert.match(appSource, /if \(creatingGroupBusy \|\| creatingGroupLimitReached\) return/u)
  assert.doesNotMatch(appSource, /if \(creatingGroupBusy \|\| !canCreateGroup \|\| creatingGroupLimitReached\) return/u)
})

test('attachment picker keeps premium upsell crown inline with premium copy and shows themed action icons', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const pickerSource = readFileSync(join(repoRoot, 'src', 'components', 'ComposerAttachmentPicker.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(pickerSource, /attachmentModes\?: Array<'file' \| 'photo'>/u)
  assert.match(pickerSource, /attachmentModes = \['photo', 'file'\]/u)
  assert.match(pickerSource, /const singleAttachmentMode(?:: [^=]+)? =\s*availableAttachmentModes\.length === 1/u)
  assert.match(pickerSource, /if \(singleAttachmentMode\) \{\s*handleSelect\(singleAttachmentMode\)/u)
  assert.match(pickerSource, /supportsPhotoAttachments \? \(/u)
  assert.match(pickerSource, /supportsFileAttachments \? \(/u)
  assert.match(pickerSource, /Документы, архивы и видео до 10 МБ\./u)
  assert.match(pickerSource, /Документы, архивы и видео до 200 МБ\./u)
  assert.match(pickerSource, /composer-attachment-inline-premium/u)
  assert.match(pickerSource, /composer-attachment-option-icon/u)
  assert.match(pickerSource, /composer-attachment-option-description/u)
  assert.match(pickerSource, /\/icons\/picture\.svg/u)
  assert.match(pickerSource, /\/icons\/videofile\.png/u)
  assert.match(pickerSource, /\/icons\/crown64\.png/u)
  assert.match(pickerSource, /<span>С премиумом<\/span>/u)
  assert.match(appCss, /\.composer-attachment-inline-premium/u)
  assert.match(appCss, /white-space:\s*nowrap/u)
  assert.match(appCss, /vertical-align:\s*baseline/u)
  assert.match(appCss, /\.composer-attachment-premium-crown/u)
  assert.match(appCss, /\.composer-attachment-popover\s*\{[\s\S]*width:\s*min\(360px,\s*calc\(100vw - 24px\)\);/u)
  assert.match(appCss, /\.composer-attachment-option\s*\{[\s\S]*grid-template-columns:\s*56px minmax\(0, 1fr\);/u)
  assert.match(appCss, /\.composer-attachment-option-icon\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/u)
  assert.match(appCss, /\.composer-attachment-option-icon/u)
  assert.match(appCss, /\.composer-attachment-option-icon img\s*\{[\s\S]*filter:\s*var\(--icon-filter\);/u)
  assert.match(appCss, /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.composer-attachment-popover\s*\{[\s\S]*width:\s*min\(340px,\s*calc\(100vw - 20px\)\);/u)
  assert.match(appCss, /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.composer-attachment-picker\s*\{[\s\S]*position:\s*static;/u)
  assert.match(appCss, /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.composer-attachment-popover\s*\{[\s\S]*left:\s*auto;[\s\S]*right:\s*0;[\s\S]*max-width:\s*calc\(100vw - 20px\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.composer-attachment-option-icon/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.composer-attachment-option:hover \.composer-attachment-option-icon/u)
})

test('composers stay on plain textarea inputs without formatting toolbar', () => {
  const repoRoot = process.cwd()
  const appUtilsSource = readFileSync(join(repoRoot, 'src', 'app', 'utils.ts'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const roomComposerSource = readFileSync(join(repoRoot, 'src', 'components', 'RoomComposer.tsx'), 'utf8')
  const sharedUtilsSource = readFileSync(join(repoRoot, 'src', 'shared', 'utils.ts'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.doesNotMatch(directRoomSource, /<ComposerFormattingToolbar/u)
  assert.doesNotMatch(groupRoomSource, /<ComposerFormattingToolbar/u)
  assert.doesNotMatch(channelRoomSource, /<ComposerFormattingToolbar/u)
  assert.doesNotMatch(appSource, /<ComposerFormattingToolbar/u)
  assert.doesNotMatch(roomComposerSource, /<ComposerFormattingToolbar/u)
  assert.doesNotMatch(directRoomSource, /<ComposerRichInput/u)
  assert.doesNotMatch(groupRoomSource, /<ComposerRichInput/u)
  assert.doesNotMatch(channelRoomSource, /<ComposerRichInput/u)
  assert.doesNotMatch(appSource, /<ComposerRichInput/u)
  assert.doesNotMatch(roomComposerSource, /<ComposerRichInput/u)
  assert.match(directRoomSource, /<RoomComposer/u)
  assert.match(groupRoomSource, /<RoomComposer/u)
  assert.match(channelRoomSource, /<RoomComposer/u)
  assert.match(appSource, /<RoomComposer/u)
  assert.match(roomComposerSource, /<textarea/u)
  assert.match(roomComposerSource, /rows=\{1\}/u)
  assert.match(roomComposerSource, /useLayoutEffect/u)
  assert.match(roomComposerSource, /attachmentModes\?: Array<'file' \| 'photo'>/u)
  assert.match(roomComposerSource, /showEmojiPicker\?: boolean/u)
  assert.match(roomComposerSource, /attachmentModes = \['photo', 'file'\]/u)
  assert.match(roomComposerSource, /showEmojiPicker = true/u)
  assert.match(roomComposerSource, /showEmojiPicker \? \(/u)
  assert.match(roomComposerSource, /resizeComposerTextarea\(textarea\)/u)
  assert.doesNotMatch(groupRoomSource, /const \[composerExpanded, setComposerExpanded\] = useState\(false\)/u)
  assert.doesNotMatch(groupRoomSource, /resizeComposerTextarea\(textarea\)/u)
  assert.doesNotMatch(channelRoomSource, /const \[publisherComposerExpanded, setPublisherComposerExpanded\] = useState\(false\)/u)
  assert.doesNotMatch(channelRoomSource, /resizeComposerTextarea\(textarea\)/u)
  assert.match(appUtilsSource, /export function resizeComposerTextarea/u)
  assert.match(appUtilsSource, /resolveComposerTextareaMaxHeight/u)
  assert.match(roomComposerSource, /<ComposerAttachmentPicker[\s\S]*attachmentModes=\{attachmentModes\}/u)
  assert.match(sharedUtilsSource, /type ComposerTextInputElement = HTMLTextAreaElement \| HTMLDivElement/u)
  assert.match(sharedUtilsSource, /insertComposerTextAtCursor/u)
  assert.match(appCss, /\.composer textarea/u)
  assert.match(appCss, /\.composer textarea\s*\{[\s\S]*min-height:\s*48px;/u)
  assert.match(appCss, /\.composer textarea\s*\{[\s\S]*padding:\s*11px 148px 11px 16px;/u)
  assert.match(appCss, /\.composer textarea\s*\{[\s\S]*overflow-y:\s*hidden;/u)
  assert.match(appCss, /\.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\)\s+\.composer-tools\s*\{[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/u)
  assert.match(appCss, /\.composer-field\.composer-field-expanded\s+\.composer-tools,[\s\S]*\.composer-field\.composer-field-has-attachment\s+\.composer-tools\s*\{[\s\S]*bottom:\s*8px;[\s\S]*transform:\s*none;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.composer textarea\s*\{[\s\S]*padding:\s*13px 126px 16px 14px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.composer textarea\s*\{[\s\S]*padding:\s*13px 116px 16px 14px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.emoji-picker\s*\{[\s\S]*position:\s*static;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.emoji-picker-popover\s*\{[\s\S]*left:\s*auto;[\s\S]*right:\s*0;[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 24px\)\);[\s\S]*max-width:\s*calc\(100vw - 24px\);/u)
  assert.match(appCss, /\.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\)\s+\.composer-send\s*\{[\s\S]*margin-bottom:\s*0;/u)
  assert.doesNotMatch(appCss, /\.composer-format-toolbar/u)
  assert.doesNotMatch(appCss, /\.composer-rich-input/u)
  assert.doesNotMatch(appCss, /\.composer-editor-surface/u)
  assert.match(sharedUtilsSource, /textDecoration/u)
  assert.match(sharedUtilsSource, /stripMessageFormattingMarkup/u)
  assert.match(sharedUtilsSource, /kind: 'external-link'/u)
  assert.match(sharedUtilsSource, /style: MessageTextStyle/u)

  assert.match(bubbleSource, /bubble-text-format-underline/u)
  assert.match(bubbleSource, /bubble-text-format-strike/u)
  assert.match(bubbleSource, /stripMessageFormattingMarkup/u)
  assert.match(appCss, /\.bubble-text-format-underline/u)
  assert.match(appCss, /\.bubble-text-format-strike/u)
})

test('delivery check icons adapt to light and dark outgoing bubbles', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const selectedOverlaySource = readFileSync(join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(bubbleSource, /shouldUseLightDeliveryIndicatorTint/u)
  assert.match(bubbleSource, /deliveryIndicatorSrc === '\/icons\/hourglass-48\.png'/u)
  assert.match(bubbleSource, /deliveryIndicatorSrc === '\/icons\/check-mark-50\.png'/u)
  assert.match(bubbleSource, /deliveryIndicatorSrc === '\/icons\/double-tick-50\.png'/u)
  assert.match(directRoomSource, /bubble-delivery-indicator bubble-delivery-indicator-light/u)
  assert.match(selectedOverlaySource, /bubble-delivery-indicator bubble-delivery-indicator-light/u)
  assert.match(appCss, /\.bubble-delivery-indicator-light\s*\{[\s\S]*filter:\s*brightness\(0\)\s*invert\(1\);/u)
  assert.match(appCss, /\.bubble-attachment-image-indicator-light\s*\{[\s\S]*filter:\s*brightness\(0\)\s*invert\(1\);/u)
  assert.match(
    appCss,
    /\.bubble\.mine \.bubble-delivery-indicator-light,\s*[\s\S]*\.bubble\.mine \.bubble-text-inline-meta-indicator-light\s*\{[\s\S]*filter:\s*var\(--icon-filter\);/u,
  )
})

test('former contacts reopen through hidden dialogs with preserved history contract', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(storeSource, /hidden\?: boolean/u)
  assert.match(storeSource, /includeHidden \|\| !dialog\.hidden/u)
  assert.match(storeSource, /Search must exclude only currently visible direct dialogs/u)
  assert.match(storeSource, /affectedDialog\.hidden = true/u)
  assert.match(storeSource, /existingDialog\.hidden = shouldHide/u)
  assert.match(handoffDoc, /delete contact hides dialogs for both sides/u)
  assert.match(handoffDoc, /hidden former-contact rooms reopen through search with preserved per-side history/u)
  assert.match(handoffDoc, /hidden former-contact не должен пропадать из server-side account search/u)
  assert.match(rolloutDoc, /delete contact hides both sides but keeps per-side direct history/u)
  assert.match(rolloutDoc, /former contact reopens through search with request CTA until accept/u)
  assert.match(rolloutDoc, /hidden former contact must still appear in search results for both sides/u)
})

test('delete history for everyone uses archive-for-both contract instead of local-only purge', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appBackendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const serverSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(sharedBackendSource, /export type DeleteDialogHistoryBody = \{/u)
  assert.match(sharedBackendSource, /scope\?: 'everyone' \| 'me'/u)
  assert.match(appBackendSource, /deleteDialogHistory\(\s*sessionToken: string,\s*dialogId: number,\s*body\?: \{ scope\?: 'everyone' \| 'me' \}/u)
  assert.match(appSource, /deleteChatHistory\(confirmingDeleteHistoryChatId, 'me'\)/u)
  assert.match(appSource, /deleteChatHistory\(confirmingDeleteHistoryChatId, 'everyone'\)/u)
  assert.match(appSource, /scope === 'everyone'/u)
  assert.match(appSource, /must not locally fake success/u)
  assert.match(appSource, /Не удалось удалить переписку у всех\. Попробуйте ещё раз\./u)
  assert.match(serverSource, /options\.scope === 'everyone'/u)
  assert.match(serverSource, /archive direct messages/u)
  assert.match(serverSource, /instead of filtering them out of the database permanently/u)
  assert.match(serverSource, /message\.archivedAt = archivedAt/u)
  assert.match(serverSource, /message\.archivedReason = 'delete-history-everyone'/u)
  assert.match(serverSource, /!message\.archivedAt/u)
  assert.match(serverSource, /must disappear from every normal user snapshot\/history view/u)
  assert.match(serverSource, /delete-history-me/u)
  assert.match(handoffDoc, /`Удалить переписку у всех` в direct-диалоге должен очищать комнату у обеих сторон/u)
  assert.match(handoffDoc, /server-side direct history при этом не удаляется физически, а архивируется для admin restore/u)
  assert.match(handoffDoc, /если server delete-for-everyone не выполнился, клиент не должен локально имитировать успешное удаление/u)
  assert.match(rolloutDoc, /delete history for everyone in direct dialogs:/u)
  assert.match(rolloutDoc, /очищает комнату у обеих сторон/u)
  assert.match(rolloutDoc, /server-side история не удаляется физически, а архивируется/u)
  assert.match(rolloutDoc, /ошибка server-side delete-for-everyone не должна приводить к локальному fake-success у инициатора/u)
})

test('delete single message for everyone keeps separate me/everyone actions and archives both dialog copies', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appBackendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const serverSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.match(sharedBackendSource, /export type DeleteDialogMessageBody = \{/u)
  assert.match(sharedBackendSource, /scope\?: 'everyone' \| 'me'/u)
  assert.match(
    appBackendSource,
    /deleteDialogMessage\(\s*sessionToken: string,\s*dialogId: number,\s*messageId: number,\s*body\?: DeleteDialogMessageBody/u,
  )
  assert.match(appSource, /const canDeleteConfirmedMessageForEveryone = confirmingDeleteMessage\?\.author === 'me'/u)
  assert.match(appSource, /deleteMessage\(activeChat\.id, confirmingDeleteMessageId, 'me'\)/u)
  assert.match(appSource, /deleteMessage\(activeChat\.id, confirmingDeleteMessageId, 'everyone'\)/u)
  assert.match(appSource, /\{canDeleteConfirmedMessageForEveryone \? \(/u)
  assert.match(appSource, /<div className="room-confirm room-confirm-compact">/u)
  assert.match(appSource, /room-confirm-actions-dual/u)
  assert.match(appSource, /`Удалить у всех` is a server-authoritative destructive action\./u)
  assert.match(appSource, /window\.alert\(error\.message\)/u)
  assert.match(serverSource, /options\.scope === 'everyone'/u)
  assert.match(serverSource, /Удалить у всех можно только своё сообщение/u)
  assert.match(serverSource, /archivedReason = 'delete-message-everyone'/u)
  assert.match(serverSource, /archivedReason = 'delete-message-me'/u)
  assert.match(serverSource, /findDialogByPhone\(peerAccount\.identifier, account\.identifier\)/u)
  assert.match(serverSource, /peerCopy\.archivedReason = 'delete-message-everyone'/u)
  assert.match(serverSource, /buildCanonicalDirectTranscript/u)
  assert.match(serverSource, /buildDirectRetentionNoteForExport/u)
  assert.match(serverSource, /Retention Note/u)
  assert.match(serverSource, /Сообщение удалено пользователем у всех, но серверная запись сохранена\./u)
  assert.match(serverSource, /Visible For/u)
  assert.match(handoffDoc, /delete single message for everyone in direct dialogs:/u)
  assert.match(handoffDoc, /для входящего сообщения action `Удалить у всех` не должен показываться вообще/u)
  assert.match(rolloutDoc, /delete single message for everyone in direct dialogs:/u)
  assert.match(rolloutDoc, /на входящем сообщении `Удалить у всех` не должно отображаться/u)
  assert.match(releaseContractsDoc, /Direct Delete-For-Everyone Contract/u)
  assert.match(releaseContractsDoc, /UI не должен показывать `Удалить у всех` для входящего direct-сообщения/u)
  assert.match(releaseContractsDoc, /direct self-delete is retention-safe and admin\/legal exports use a canonical transcript/u)
})

test('room history window drops prepended older items after destructive empty reset', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const historyWindowSource = readFileSync(join(repoRoot, 'src', 'app', 'useRoomHistoryWindow.ts'), 'utf8')

  assert.match(historyWindowSource, /function compareTimelineItemIds\(leftId: number, rightId: number\)/u)
  assert.match(historyWindowSource, /const leftOptimistic = leftId < 0/u)
  assert.match(historyWindowSource, /return leftOptimistic \? 1 : -1/u)
  assert.match(historyWindowSource, /return rightId - leftId/u)
  assert.match(historyWindowSource, /pending bubble renders[\s\S]*"jumps" down once the server ack replaces it/u)
  assert.match(historyWindowSource, /items\.length > 0 \|\| currentState\.olderItems\.length === 0/u)
  assert.match(historyWindowSource, /previously prepended olderItems must be dropped too/u)
  assert.match(historyWindowSource, /olderItems: \[\]/u)
  assert.match(historyWindowSource, /storage cleanup[\s\S]*removal note/u)
  assert.match(historyWindowSource, /owner sees the quota notice[\s\S]*other participant/u)
  assert.match(historyWindowSource, /olderItems: mergeTimelineItems\(currentState\.olderItems, refreshedOlderItems\)/u)
})

test('all referenced icon assets exist in public/icons and stay world-readable for staging nginx', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sourceFiles = listSourceFiles(join(repoRoot, 'src'))
  const iconRefs = new Set<string>()

  for (const filePath of sourceFiles) {
    const contents = readFileSync(filePath, 'utf8')
    for (const match of contents.matchAll(/['"](?<path>\/icons\/[^'"]+)['"]/g)) {
      const iconPath = match.groups?.path
      if (iconPath) {
        iconRefs.add(iconPath)
      }
    }
  }

  const missingIcons = [...iconRefs].filter(
    (iconPath) => !existsSync(join(repoRoot, 'public', iconPath.replace(/^\//u, ''))),
  )
  assert.deepEqual(missingIcons, [])

  const unreadableIcons = [...iconRefs].filter((iconPath) => {
    const stats = statSync(join(repoRoot, 'public', iconPath.replace(/^\//u, '')))
    return (stats.mode & 0o004) === 0
  })
  assert.deepEqual(unreadableIcons, [])
})

test('privacy policy page mirrors the current tinychok.ru document and new pdf asset', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const privacyContentSource = readFileSync(join(repoRoot, 'src', 'privacyPolicyContent.ts'), 'utf8')
  const privacyPageSource = readFileSync(join(repoRoot, 'src', 'PrivacyPolicyPage.tsx'), 'utf8')

  assert.match(privacyContentSource, /export const privacyPolicyPdfPath = '\/privacy-policy\.pdf'/u)
  assert.match(privacyContentSource, /export const privacyPolicyUpdatedAt = '03\.04\.2026'/u)
  assert.ok(!/tinychok\.com/u.test(privacyContentSource))
  assert.ok(!/tinychok\.com/u.test(privacyPageSource))
  assert.ok(!/policy-page-callout/u.test(privacyPageSource))
  assert.ok(!/Контактный адрес электронной почты службы поддержки: devisjjones@gmail\.com/u.test(privacyContentSource))
  assert.ok(!/Email службы поддержки: devisjjones@gmail\.com/u.test(privacyContentSource))
  assert.match(
    privacyContentSource,
    /Контактный адрес электронной почты службы поддержки: tinychok\.help@yandex\.com/u,
  )
  assert.match(privacyContentSource, /Email службы поддержки: tinychok\.help@yandex\.com/u)
  assert.match(
    privacyContentSource,
    /сайта tinychok\.ru, а также связанных с ним сервисов, приложений, API, медиа-сервисов, веб-интерфейсов и функционала мессенджера Tinychok/u,
  )
  assert.match(privacyContentSource, /1\.4\. Если отдельные доменные имена/u)
  assert.match(privacyContentSource, /2\.3\. Для обеспечения функционирования сервиса/u)
  assert.match(
    privacyContentSource,
    /2\.4\. Обращения субъектов персональных данных по вопросам обработки персональных данных/u,
  )
  assert.match(privacyContentSource, /12 месяцев после закрытия обращения/u)
  assert.match(
    privacyContentSource,
    /отдельные вложения, файлы, изображения и иные медиафайлы, загруженные Пользователем, могут быть удалены автоматически при достижении лимита пользовательского хранилища/u,
  )
  assert.match(
    privacyContentSource,
    /в таких случаях сообщение, пост, комментарий или иная связанная запись могут сохраниться без самого вложения/u,
  )
  assert.match(
    privacyContentSource,
    /автоматическое удаление вложений для освобождения места в пользовательском хранилище/u,
  )
  assert.match(
    privacyContentSource,
    /18\.3\. Актуальная версия Политики постоянно доступна по адресу: https:\/\/tinychok\.ru\/privacy-policy\.html/u,
  )
  assert.match(
    privacyContentSource,
    /Публичная страница с контактной информацией: https:\/\/tinychok\.ru\/contacts\.html/u,
  )
  assert.ok(existsSync(join(repoRoot, 'public', 'privacy-policy.pdf')))
})

test('user agreement page mirrors the current tinychok.ru document and pdf asset', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const agreementContentSource = readFileSync(join(repoRoot, 'src', 'userAgreementContent.ts'), 'utf8')
  const agreementPageSource = readFileSync(join(repoRoot, 'src', 'UserAgreementPage.tsx'), 'utf8')

  assert.match(agreementContentSource, /export const userAgreementPdfPath = ['"]\/user-agreement\.pdf['"]/u)
  assert.match(agreementContentSource, /export const userAgreementUpdatedAt = ['"]31\.03\.2026['"]/u)
  assert.match(
    agreementContentSource,
    /Настоящее Пользовательское соглашение \(далее — Соглашение\) регулирует отношения между Индивидуальным предпринимателем Мерзляковым Алексеем Сергеевичем/u,
  )
  assert.match(
    agreementContentSource,
    /3\.4\. Подтверждение регистрации и входа в Сервис может осуществляться с использованием SMS-кода, пароля/u,
  )
  assert.match(
    agreementContentSource,
    /5\.4\. В Сервисе могут быть доступны настройки уведомлений, приватности, режима «Тихо», режима невидимости/u,
  )
  assert.match(
    agreementContentSource,
    /8\.9\. При наличии признаков мошенничества, несанкционированной оплаты/u,
  )
  assert.match(
    agreementContentSource,
    /15\.4\. Пользователь понимает и соглашается, что Сервис не предназначен для передачи экстренных сообщений/u,
  )
  assert.match(
    agreementContentSource,
    /17\.8\. При полном или частичном прекращении работы Сервиса Администратор вправе установить разумный срок/u,
  )
  assert.match(
    agreementContentSource,
    /Email поддержки: tinychok\.help@yandex\.com/u,
  )
  assert.match(
    agreementContentSource,
    /Официальный сайт \/ домен Сервиса: https:\/\/tinychok\.ru/u,
  )
  assert.ok(!/policy-page-callout/u.test(agreementPageSource))
  assert.match(agreementPageSource, /userAgreementIntroBlocks/u)
  assert.match(agreementPageSource, /download="Пользовательское соглашение\. Тайничок\.pdf"/u)
  assert.match(agreementPageSource, /href=\{userAgreementPdfPath\}/u)
  assert.ok(existsSync(join(repoRoot, 'public', 'user-agreement.pdf')))
})

test('premium terms page mirrors the approved premium document and checkout links to it', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const premiumTermsContentSource = readFileSync(
    join(repoRoot, 'src', 'premiumTermsContent.ts'),
    'utf8',
  )
  const premiumTermsPageSource = readFileSync(
    join(repoRoot, 'src', 'PremiumTermsPage.tsx'),
    'utf8',
  )
  const premiumCheckoutSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const viteConfigSource = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')

  assert.match(premiumTermsContentSource, /export const premiumTermsPdfPath = '\/premium-terms\.pdf'/u)
  assert.match(premiumTermsContentSource, /export const premiumTermsUpdatedAt = '31\.03\.2026'/u)
  assert.match(
    premiumTermsContentSource,
    /Настоящие Условия Premium в сервисе «Тайничок» \(далее — Условия Premium\) регулируют порядок приобретения и использования платных premium-функций/u,
  )
  assert.match(
    premiumTermsContentSource,
    /5\.1\.1\. Premium на 1 месяц — 199 \(сто девяносто девять\) рублей/u,
  )
  assert.match(
    premiumTermsContentSource,
    /5\.1\.2\. Premium на 1 год — 1390 \(одна тысяча триста девяносто\) рублей/u,
  )
  assert.match(
    premiumTermsContentSource,
    /5\.4\. Premium не считается автоматически продлеваемым по умолчанию/u,
  )
  assert.match(
    premiumTermsContentSource,
    /7\.1\.1\. Тонкая настройка режима «Тихо»\./u,
  )
  assert.match(
    premiumTermsContentSource,
    /7\.1\.5\. Увеличение лимита хранилища файлов до 1000 МБ\./u,
  )
  assert.match(
    premiumTermsContentSource,
    /7\.1\.7\. Увеличение максимально допустимого размера группы до 200 участников\./u,
  )
  assert.match(
    premiumTermsContentSource,
    /11\.5\. Для рассмотрения обращения по оплате или возврату Пользователь должен указать номер телефона аккаунта/u,
  )
  assert.match(
    premiumTermsContentSource,
    /документы, подтверждающие списание денежных средств и совершение оплаты/u,
  )
  assert.match(
    premiumTermsContentSource,
    /14\.4\. Полное или частичное прекращение работы сервиса не освобождает Администратора/u,
  )
  assert.match(premiumTermsPageSource, /href=\{premiumTermsPdfPath\}/u)
  assert.match(premiumTermsPageSource, /download="Условия Premium\. Тайничок\.pdf"/u)
  assert.match(premiumCheckoutSource, /href="\/premium-terms\.html"/u)
  assert.match(premiumCheckoutSource, /className="premium-legal-links premium-legal-links-outside"/u)
  assert.match(viteConfigSource, /premiumTerms: resolve\(viteConfigDir, 'premium-terms\.html'\)/u)
  assert.ok(existsSync(join(repoRoot, 'public', 'premium-terms.pdf')))
})

test('refund policy page mirrors the approved refund document and premium checkout links to it', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const refundPolicyContentSource = readFileSync(
    join(repoRoot, 'src', 'refundPolicyContent.ts'),
    'utf8',
  )
  const refundPolicyPageSource = readFileSync(
    join(repoRoot, 'src', 'RefundPolicyPage.tsx'),
    'utf8',
  )
  const premiumCheckoutSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const viteConfigSource = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')

  assert.match(refundPolicyContentSource, /export const refundPolicyEffectiveDate = '11\.04\.2026'/u)
  assert.match(
    refundPolicyContentSource,
    /Настоящая Политика возвратов регулирует порядок отмены автопродления подписки «Премиум Тайничок»/u,
  )
  assert.match(refundPolicyContentSource, /199 ₽ за 30 календарных дней доступа/u)
  assert.match(refundPolicyContentSource, /1390 ₽ за 365 календарных дней доступа/u)
  assert.match(
    refundPolicyContentSource,
    /пользователю возвращается полная одобренная к возврату сумма/u,
  )
  assert.match(
    refundPolicyContentSource,
    /Исполнитель: Индивидуальный предприниматель Мерзляков Алексей Сергеевич/u,
  )
  assert.match(refundPolicyContentSource, /Email поддержки: tinychok\.help@yandex\.com/u)
  assert.match(refundPolicyPageSource, /Дата вступления в силу: \{refundPolicyEffectiveDate\}/u)
  assert.match(refundPolicyPageSource, /handleScrollToTop/u)
  assert.match(refundPolicyPageSource, /window\.scrollTo\(\{[\s\S]*behavior:\s*'smooth'/u)
  assert.match(refundPolicyPageSource, /Вернуться в Тайничок/u)
  assert.match(refundPolicyPageSource, /Наверх/u)
  assert.match(premiumCheckoutSource, /href="\/refund-policy\.html"/u)
  assert.match(
    premiumCheckoutSource,
    /Условиями Premium[\s\S]*Политикой возвратов/u,
  )
  assert.match(
    premiumCheckoutSource,
    /aria-label="Условия Premium и политика возвратов перед оплатой"/u,
  )
  assert.match(viteConfigSource, /refundPolicy: resolve\(viteConfigDir, 'refund-policy\.html'\)/u)
  assert.ok(existsSync(join(repoRoot, 'refund-policy.html')))
})

test('premium debug toggle stays in the top-right header cluster without helper copy', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const premiumViewStart = appSource.indexOf('{isPremiumView ? (')

  assert.ok(premiumViewStart >= 0)

  const premiumViewSource = appSource.slice(premiumViewStart)
  assert.match(premiumViewSource, /className="premium-debug-toggle-row"/u)
  assert.doesNotMatch(premiumViewSource, /Автопокупка для тестов/u)
  assert.doesNotMatch(premiumViewSource, /premium-debug-inline-copy/u)
  assert.doesNotMatch(appCss, /\.premium-debug-inline-copy/u)
})

test('premium footer keeps legal links on the right and cards align their CTA rows', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /<div className="settings-actions premium-actions">[\s\S]*<button[\s\S]*Назад/u)
  assert.match(appSource, /<\/div>\s*<\/div>\s*<div className="premium-legal-links premium-legal-links-outside"/u)
  assert.match(appSource, /Нажимая «Купить», вы подтверждаете, что ознакомились и соглашаетесь с/u)
  assert.match(appSource, /href="\/premium-terms\.html"[\s\S]*Условиями Premium/u)
  assert.match(appSource, /href="\/refund-policy\.html"[\s\S]*Политикой возвратов/u)
  assert.match(appSource, /aria-label="Условия Premium и политика возвратов перед оплатой"/u)
  assert.doesNotMatch(appSource, /href="\/user-agreement\.html"[\s\S]{0,600}<div className="premium-legal-links"/u)
  assert.doesNotMatch(appSource, /href="\/privacy-policy\.html"[\s\S]{0,600}<div className="premium-legal-links"/u)
  assert.doesNotMatch(appSource, /href="\/contacts\.html"[\s\S]{0,600}<div className="premium-legal-links"/u)
  assert.match(appCss, /\.premium-actions\s*\{[\s\S]*justify-content:\s*space-between;/u)
  assert.match(appCss, /\.premium-legal-links\s*\{[\s\S]*justify-items:\s*end;/u)
  assert.match(appCss, /\.premium-legal-links\s*\{[\s\S]*text-align:\s*right;/u)
  assert.match(appCss, /\.premium-legal-links\s*\{[\s\S]*max-width:\s*26rem;/u)
  assert.match(appCss, /\.premium-legal-links-outside\s*\{[\s\S]*width:\s*min\(920px, 100%\);[\s\S]*margin:\s*8px auto 0;[\s\S]*padding:\s*0 28px;/u)
  assert.match(appCss, /\.premium-consent-copy\s*\{[\s\S]*font-size:\s*0\.92rem;[\s\S]*line-height:\s*1\.45;/u)
  assert.match(appCss, /\.premium-note\s*\{[\s\S]*min-height:\s*calc\(1\.45em \* 2\);/u)
  assert.match(appCss, /\.premium-card\s*\{[\s\S]*grid-template-rows:\s*auto auto 1fr auto;/u)
  assert.match(appCss, /\.premium-card\s*\{[\s\S]*height:\s*100%;/u)
  assert.match(appSource, /<article className="premium-card premium-card-monthly">/u)
  assert.match(appCss, /\.premium-card-monthly\s*\{[\s\S]*background:\s*rgba\(244, 234, 226, 0\.94\);/u)
  assert.match(appCss, /\.premium-card-annual\s*\{[\s\S]*background:\s*rgba\(255, 253, 249, 0\.98\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.premium-card-annual\s*\{[\s\S]*linear-gradient\([\s\S]*rgba\(255,\s*255,\s*255,\s*0\.13\)[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.1\)[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.16\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.premium-annual-badge,[\s\S]*background:\s*rgba\(164,\s*91,\s*78,\s*0\.18\);/u)
  assert.match(appCss, /\.premium-stack\s*\{[\s\S]*align-items:\s*stretch;/u)
})

test('narrow mobile view keeps settings, room headers and admin panels from overflowing', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const adminCss = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')
  const indexCss = readFileSync(join(repoRoot, 'src', 'index.css'), 'utf8')

  assert.match(indexCss, /html\s*\{[\s\S]*-webkit-text-size-adjust:\s*100%;[\s\S]*text-size-adjust:\s*100%;/u)
  assert.match(indexCss, /html\s*\{[\s\S]*overflow-x:\s*hidden;/u)
  assert.match(indexCss, /body\s*\{[\s\S]*-webkit-text-size-adjust:\s*100%;[\s\S]*text-size-adjust:\s*100%;/u)
  assert.match(indexCss, /body\s*\{[\s\S]*overflow-x:\s*hidden;/u)
  assert.match(indexCss, /#root\s*\{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*hidden;/u)
  assert.match(indexCss, /@media \(max-width: 960px\) \{[\s\S]*html,\s*[\s\S]*body,\s*[\s\S]*#root\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*min-height:\s*100vh;[\s\S]*min-height:\s*100dvh;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/u)
  assert.match(indexCss, /@media \(max-width: 560px\) \{[\s\S]*html,\s*[\s\S]*body\s*\{[\s\S]*-webkit-text-size-adjust:\s*none;[\s\S]*text-size-adjust:\s*none;[\s\S]*font-family:\s*[\s\S]*system-ui/u)
  assert.match(appCss, /\.account-headline h2\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal;/u)
  assert.match(appCss, /\.account-status-row p\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.settings-panel\s*\{[\s\S]*width:\s*100%;[\s\S]*padding:\s*18px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.shell,\s*[\s\S]*\.auth-shell,\s*[\s\S]*\.confirm-shell,\s*[\s\S]*\.policy-shell\s*\{[\s\S]*padding:\s*8px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.rail\s*\{[\s\S]*padding:\s*0 4px 0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.account-header\s*\{[\s\S]*padding:\s*9px 10px 8px;[\s\S]*margin-inline:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.filters\s*\{[\s\S]*padding:\s*7px 8px 8px;[\s\S]*margin-inline:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.chat-list\s*\{[\s\S]*padding-inline:\s*4px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.bottom-nav\s*\{[\s\S]*padding:\s*10px;[\s\S]*margin-inline:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.shell-main-list\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.shell-main-room\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.shell-settings\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*min-height:\s*100vh;[\s\S]*min-height:\s*100dvh;[\s\S]*overflow-y:\s*auto;[\s\S]*overflow-x:\s*hidden;[\s\S]*overscroll-behavior-y:\s*contain;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.shell-main-list \.rail\s*\{[\s\S]*overflow:\s*hidden;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.shell-settings,\s*[\s\S]*\.message-feed,\s*[\s\S]*\.emoji-picker-gif-grid\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/u)
  assert.doesNotMatch(appCss, /\.shell-settings,\s*[\s\S]*\.message-feed,\s*[\s\S]*\.emoji-picker-gif-grid\s*\{[\s\S]*touch-action:\s*pan-y;/u)
  assert.match(appCss, /\.room-confirm\s*\{[\s\S]*max-height:\s*calc\(100dvh - 32px\);[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.room-confirm\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.chat-list\s*\{[\s\S]*padding-top:\s*3px;[\s\S]*padding-inline:\s*8px;[\s\S]*padding-bottom:\s*2px;[\s\S]*overscroll-behavior-y:\s*contain;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.account-headline\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.account-name\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\);/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.chat-card\.chat-card-compact \.chat-topline\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.chat-topline-meta,\s*[\s\S]*font-variant-numeric:\s*tabular-nums;[\s\S]*font-feature-settings:\s*"tnum" 1;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.contacts-filters\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/u)
  assert.match(appCss, /\.composer-attachment-preview-status\.error\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow:\s*visible;[\s\S]*text-overflow:\s*clip;[\s\S]*line-height:\s*1\.35;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.composer-attachment-preview\s*\{[\s\S]*gap:\s*10px;[\s\S]*padding-right:\s*10px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.composer-attachment-preview-copy\s*\{[\s\S]*gap:\s*6px;[\s\S]*padding:\s*12px 0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.composer-attachment-preview-title-row\s*\{[\s\S]*min-height:\s*34px;[\s\S]*padding-right:\s*44px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.composer-attachment-preview-clear\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*10px;[\s\S]*right:\s*10px;[\s\S]*align-self:\s*auto;[\s\S]*width:\s*34px;[\s\S]*min-width:\s*34px;[\s\S]*height:\s*34px;[\s\S]*z-index:\s*1;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-header\s*\{[\s\S]*padding:\s*8px 8px 7px;[\s\S]*grid-template-columns:\s*26px minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*5px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-actions\s*\{[\s\S]*gap:\s*4px;[\s\S]*margin-right:\s*-2px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-mobile-back\s*\{[\s\S]*min-width:\s*26px;[\s\S]*height:\s*44px;[\s\S]*margin-left:\s*-2px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-menu-button,\s*[\s\S]*\.room-star,\s*[\s\S]*\.room-group-actions-toggle\s*\{[\s\S]*min-width:\s*34px;[\s\S]*height:\s*44px;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-shell\s*\{[\s\S]*place-items:\s*stretch;[\s\S]*overflow-x:\s*hidden;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-panel,\s*[\s\S]*\.auth-card,\s*[\s\S]*\.auth-support-footer,\s*[\s\S]*\.auth-form,\s*[\s\S]*\.auth-field,\s*[\s\S]*\.auth-code-note,\s*[\s\S]*\.auth-captcha\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-panel,\s*[\s\S]*\.auth-card,\s*[\s\S]*\.auth-support-footer,\s*[\s\S]*\.auth-form,\s*[\s\S]*\.auth-field,\s*[\s\S]*\.auth-code-note,\s*[\s\S]*\.auth-captcha,\s*[\s\S]*\.auth-submit,\s*[\s\S]*\.auth-submit-note,\s*[\s\S]*\.auth-support-row,\s*[\s\S]*\.auth-support-link,\s*[\s\S]*\.auth-support-meta-link\s*\{[\s\S]*max-inline-size:\s*100%;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-card-brand h2\s*\{[\s\S]*max-width:\s*100%;[\s\S]*text-wrap:\s*auto;[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-field input\s*\{[\s\S]*font-size:\s*16px;[\s\S]*letter-spacing:\s*0;[\s\S]*word-spacing:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-card-brand,\s*[\s\S]*\.auth-card-brand h2,\s*[\s\S]*\.auth-returning-title,\s*[\s\S]*\.auth-copy,\s*[\s\S]*\.auth-note,\s*[\s\S]*\.auth-field span,\s*[\s\S]*\.auth-code-note,\s*[\s\S]*\.auth-code-note span,\s*[\s\S]*\.auth-code-note strong,\s*[\s\S]*\.auth-submit-note,\s*[\s\S]*\.auth-captcha-note,\s*[\s\S]*\.auth-captcha-state,\s*[\s\S]*\.auth-support-label,\s*[\s\S]*\.auth-support-link,\s*[\s\S]*\.auth-support-meta-link\s*\{[\s\S]*font-family:\s*[\s\S]*system-ui[\s\S]*text-wrap:\s*wrap;[\s\S]*text-align:\s*left;[\s\S]*overflow-wrap:\s*break-word;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-submit-note,\s*[\s\S]*\.auth-support-footer,\s*[\s\S]*\.auth-support-row,\s*[\s\S]*\.auth-support-label,\s*[\s\S]*\.auth-support-link,\s*[\s\S]*\.auth-support-meta-link\s*\{[\s\S]*text-align:\s*center;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-captcha-widget\s*\{[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;[\s\S]*overflow-x:\s*auto;[\s\S]*overflow-y:\s*hidden;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-captcha-widget > \*\s*\{[\s\S]*max-width:\s*100%\s*!important;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-captcha-widget iframe\s*\{[\s\S]*max-width:\s*100%\s*!important;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.auth-support-row\s*\{[\s\S]*display:\s*grid;[\s\S]*justify-items:\s*center;[\s\S]*text-align:\s*center;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.settings-panel-storage,\s*[\s\S]*\.premium-panel\s*\{[\s\S]*width:\s*100%;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.storage-usage-header,\s*[\s\S]*\.settings-storage-meta\s*\{[\s\S]*flex-direction:\s*column;/u)
  assert.match(appCss, /@media \(max-width: 560px\) \{[\s\S]*\.settings-storage-file-card strong,\s*[\s\S]*\.settings-storage-card-copy strong,\s*[\s\S]*\.premium-consent-copy \.settings-inline-link\s*\{[\s\S]*white-space:\s*normal;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.shell,\s*[\s\S]*\.auth-shell,\s*[\s\S]*\.confirm-shell,\s*[\s\S]*\.policy-shell\s*\{[\s\S]*padding:\s*6px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.rail\s*\{[\s\S]*padding:\s*0 2px 0;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.account-header\s*\{[\s\S]*padding:\s*8px 9px;[\s\S]*gap:\s*8px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.filters\s*\{[\s\S]*padding:\s*6px 7px 7px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.bottom-nav\s*\{[\s\S]*padding:\s*8px;[\s\S]*gap:\s*5px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.room-header\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) auto;[\s\S]*gap:\s*7px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.room-mobile-back\s*\{[\s\S]*width:\s*32px;[\s\S]*height:\s*48px;[\s\S]*border-radius:\s*15px;[\s\S]*margin-left:\s*-1px;[\s\S]*box-shadow:\s*0 10px 24px rgba\(17,\s*18,\s*20,\s*0\.08\);/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.room-menu-button,\s*[\s\S]*\.room-star,\s*[\s\S]*\.room-group-actions-toggle\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*48px;[\s\S]*border-radius:\s*15px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.media-bubble-row\s*\{[\s\S]*width:\s*min\(100%, calc\(100vw - 28px\)\);[\s\S]*max-width:\s*min\(100%, calc\(100vw - 28px\)\);[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) 38px;[\s\S]*gap:\s*8px;[\s\S]*min-width:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.media-bubble-row\.mine\s*\{[\s\S]*grid-template-columns:\s*38px minmax\(0,\s*1fr\);/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.media-bubble-row-action\s*\{[\s\S]*width:\s*38px;[\s\S]*min-width:\s*38px;/u)
  assert.match(appCss, /@media \(max-width: 960px\) \{[\s\S]*\.media-bubble-row > \.bubble\.media-only-bubble,\s*[\s\S]*\.media-bubble-row > \.channel-post\.media-only-bubble\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-header\s*\{[\s\S]*padding:\s*8px 8px 7px;[\s\S]*grid-template-columns:\s*26px minmax\(0,\s*1fr\) auto;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-id \.avatar\.large\s*\{[\s\S]*width:\s*50px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-mobile-back\s*\{[\s\S]*width:\s*26px;[\s\S]*height:\s*44px;[\s\S]*border-radius:\s*13px;[\s\S]*margin-left:\s*-2px;/u)
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-menu-button,\s*[\s\S]*\.room-star,\s*[\s\S]*\.room-group-actions-toggle\s*\{[\s\S]*width:\s*34px;[\s\S]*height:\s*44px;[\s\S]*border-radius:\s*13px;/u)
  assert.match(adminCss, /@media \(max-width: 700px\) \{[\s\S]*\.admin-topbar,\s*[\s\S]*\.admin-panel,\s*[\s\S]*\.admin-auth-copy,\s*[\s\S]*\.admin-auth-card,\s*[\s\S]*\.admin-guard-card\s*\{[\s\S]*padding:\s*18px;/u)
  assert.match(adminCss, /@media \(max-width: 700px\) \{[\s\S]*\.admin-topbar,\s*[\s\S]*\.admin-panel-heading,\s*[\s\S]*\.admin-topbar strong\s*\{[\s\S]*flex-direction:\s*column;/u)
  assert.match(adminCss, /@media \(max-width: 480px\) \{[\s\S]*\.admin-nav-item,\s*[\s\S]*\.admin-list-item,\s*[\s\S]*\.admin-filter-tab,\s*[\s\S]*\.admin-primary-button,\s*[\s\S]*\.admin-secondary-button\s*\{[\s\S]*min-height:\s*42px;/u)
})

test('dark theme toggle persists in session snapshots and ships a gray dark-surface contract', async () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const indexCss = readFileSync(join(repoRoot, 'src', 'index.css'), 'utf8')
  const storageSource = readFileSync(join(repoRoot, 'src', 'app', 'storage.ts'), 'utf8')
  const sharedTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'types.ts'), 'utf8')
  const backendTypesSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(sharedTypesSource, /darkThemeEnabled\?: boolean/u)
  assert.match(backendTypesSource, /'darkThemeEnabled'/u)
  assert.match(storageSource, /darkThemeEnabled: Boolean\(account\.darkThemeEnabled\)/u)
  assert.match(storageSource, /darkThemeEnabled: Boolean\(parsed\.darkThemeEnabled\)/u)
  assert.match(appSource, /buildProfileSettingsDraft\(session: Session\)[\s\S]*darkThemeEnabled: Boolean\(session\.darkThemeEnabled\)/u)
  assert.match(appSource, /const darkThemeEnabled = Boolean\(profilePreviewSession\?\.darkThemeEnabled\)/u)
  assert.match(appSource, /root\.dataset\.theme = nextTheme/u)
  assert.match(appSource, /body\.dataset\.theme = nextTheme/u)
  assert.match(appSource, /themeColorMeta\.content = darkThemeEnabled \? '#17181c' : '#f7efe5'/u)
  assert.match(appSource, /<span>Тёмная тема<\/span>/u)
  assert.match(appSource, /Перекрасить интерфейс в спокойные серые оттенки\./u)
  assert.match(
    indexCss,
    /:root\s*\{[\s\S]*--surface-bubble:\s*rgba\(255,\s*253,\s*249,\s*0\.98\);[\s\S]*--surface-bubble-mine:\s*rgba\(255,\s*255,\s*255,\s*0\.96\);[\s\S]*--surface-bubble-mine-ink:\s*#5a4032;[\s\S]*--surface-bubble-border:\s*rgba\(132,\s*123,\s*117,\s*0\.16\);[\s\S]*--shadow-bubble-incoming:\s*rgba\(72,\s*52,\s*33,\s*0\.1\);/u,
  )
  assert.match(indexCss, /html\[data-theme='dark'\]\s*\{[\s\S]*color-scheme:\s*dark;[\s\S]*--app-background:[\s\S]*#111214/u)
  assert.match(indexCss, /html\[data-theme='dark'\]\s*\{[\s\S]*--surface-bubble-mine:\s*rgba\(55,\s*57,\s*65,\s*0\.96\);[\s\S]*--surface-bubble-border:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*--shadow-bubble-incoming:\s*rgba\(0,\s*0,\s*0,\s*0\.28\);/u)
  assert.match(appCss, /\.bubble\.mine \.bubble-delivery-caption\s*\{[\s\S]*color:\s*rgba\(90,\s*64,\s*50,\s*0\.76\);/u)
  assert.match(appCss, /\.bubble:not\(\.mine\):not\(\.media-only-bubble\):not\(\.emoji-only-message\):not\(\.video-note-only-bubble\) \{\s*border:\s*1px solid var\(--surface-bubble-border\);[\s\S]*box-shadow:\s*0 18px 34px var\(--shadow-bubble-incoming\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.room-header\s*\{/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.channel-description-dialog-text\s*\{[\s\S]*color:\s*var\(--ink\);/u)
  assert.match(appCss, /\.composer-reply\s*\{[\s\S]*margin-bottom:\s*4px;/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.emoji-picker-section-title,\s*[\s\S]*\.emoji-picker-gif-search-label,\s*[\s\S]*\.emoji-picker-gif-section-title,\s*[\s\S]*\.emoji-picker-gif-upload-hint,\s*[\s\S]*\.emoji-picker-gif-blocked p\s*\{[\s\S]*color:\s*var\(--muted\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.emoji-picker-gif-search-input\s*\{[\s\S]*color-scheme:\s*light;[\s\S]*color:\s*rgba\(51,\s*35,\s*25,\s*0\.96\)\s*!important;[\s\S]*caret-color:\s*rgba\(51,\s*35,\s*25,\s*0\.96\);[\s\S]*-webkit-text-fill-color:\s*rgba\(51,\s*35,\s*25,\s*0\.96\)\s*!important;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.emoji-picker-gif-search-input::placeholder\s*\{[\s\S]*color:\s*rgba\(117,\s*83,\s*60,\s*0\.64\);[\s\S]*-webkit-text-fill-color:\s*rgba\(117,\s*83,\s*60,\s*0\.64\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.emoji-picker-tab,\s*[\s\S]*\.emoji-picker-gif-upload-button,\s*[\s\S]*\.emoji-picker-expand-button,\s*[\s\S]*\.room-menu-item,\s*[\s\S]*\.message-menu-item,\s*[\s\S]*\.video-note-recorder-preview-shell,\s*[\s\S]*\.bubble-attachment-video-fallback\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);[\s\S]*color:\s*var\(--ink\);/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.composer-attachment-storage-warning-link:hover,\s*[\s\S]*\.emoji-picker-gif-upload-button:hover:not\(:disabled\),\s*[\s\S]*\.emoji-picker-expand-button:hover,\s*[\s\S]*\.emoji-picker-tab:hover,\s*[\s\S]*\.emoji-picker-tab.active,\s*[\s\S]*\.room-menu-item:hover\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.14\);[\s\S]*color:\s*#ffffff;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.channel-avatar-picker-popover,[\s\S]*\.message-menu,[\s\S]*\.composer-attachment-popover/u,
  )
  assert.match(appCss, /html\[data-theme='dark'\] \.room-confirm\s*\{/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.room-confirm-button-primary,[\s\S]*\.send-button,[\s\S]*\.composer-attachment-rename-save,[\s\S]*\.premium-submit/u,
  )
  assert.match(appCss, /html\[data-theme='dark'\] \.premium-card-monthly,\s*[\s\S]*\.premium-card-annual/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.composer-attachment-preview,\s*[\s\S]*\.composer-reply/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-checkbox input\[type='checkbox'\]:checked\s*\{[\s\S]*border-color:\s*#d2d8e1;[\s\S]*background-color:\s*#bcc3cf;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.filter\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.chat-card\.active,\s*[\s\S]*\.room-participant-action,\s*[\s\S]*\.room-participant-role/u)
  assert.match(appCss, /\.composer-tool img\s*\{[\s\S]*filter:\s*var\(--icon-filter\);/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.room-menu-item-premium img/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.room-members-link,[\s\S]*\.room-channel-status a,[\s\S]*color:\s*#bcc1ca;/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.room-id a,[\s\S]*\.room-channel-status a,[\s\S]*\.room-members-link\s*\{[\s\S]*text-decoration-color:\s*rgba\(255,\s*255,\s*255,\s*0\.22\);/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.search input,[\s\S]*\.composer textarea,[\s\S]*\.room-forward-note-input,[\s\S]*\.room-transfer-search input,[\s\S]*\.settings-input,[\s\S]*\.settings-handle/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.room-mobile-back-icon,[\s\S]*\.room-menu-icon,[\s\S]*\.room-crown img,[\s\S]*\.bubble-sender-crown img,[\s\S]*filter:\s*var\(--icon-filter\);/u,
  )
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-inline-copy-button img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.settings-actions \.icon-button img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.storage-usage-upsell-icon img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.browser-notification-banner-dismiss img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.chat-star img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.contact-request-card-icon img,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.thread-pill-icon,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.room-thread-subscribe-icon,/u)
  assert.match(appCss, /html\[data-theme='dark'\] \.composer-tool img,/u)
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.room-thread-source > \.bubble-stack > \.bubble-stack-main > \.room-thread-source-bubble,[\s\S]*\.room-thread-source > \.room-thread-source-bubble/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.avatar:not\(:has\(img\)\),[\s\S]*\.channel-avatar:not\(:has\(img\)\)\s*\{[\s\S]*background-color:\s*#535763/u,
  )
  assert.match(releaseDoc, /persisted user setting `darkThemeEnabled`/u)
  assert.match(releaseDoc, /confirm dialogs, filters, share\/subscriber popups, thread root cards and inputs must stay on gray dark-surfaces/iu)
  assert.match(rolloutDoc, /persisted dark-theme toggle/iu)
  assert.match(rolloutDoc, /share\/subscriber dialogs, thread root source cards, confirm popups and composer inputs must not leak light surfaces in dark mode/iu)
  assert.match(handoffDoc, /`data-theme` contract/iu)
  assert.match(handoffDoc, /light popups, brown cards, dark-on-dark icons or pale placeholder avatars are regressions in dark mode/iu)

  const store = createStore()
  const database = getStoreDatabase(store)
  database.accounts.push(
    createAccount('+79990000001', {
      darkThemeEnabled: false,
    }),
  )
  const token = createSession(database, '+79990000001', 'dark-theme')
  markSessionLive(store, token)

  assert.equal(store.getSnapshotByToken(token)?.session.darkThemeEnabled, false)

  await store.updateSession(token, { darkThemeEnabled: true })

  assert.equal(
    database.accounts.find((account) => account.identifier === '+79990000001')?.darkThemeEnabled,
    true,
  )
  assert.equal(store.getSnapshotByToken(token)?.session.darkThemeEnabled, true)
})

test('light theme keeps outgoing pending bubbles on the same white surface as delivered messages', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    appCss,
    /\.bubble\.mine\.has-delivery-issue\s*\{[\s\S]*background:\s*var\(--surface-bubble-mine\);[\s\S]*color:\s*var\(--surface-bubble-mine-ink\);/u,
  )
  assert.match(
    appCss,
    /\.bubble\.mine\.delivery-failed\s*\{[\s\S]*background:\s*var\(--surface-bubble-mine\);[\s\S]*color:\s*var\(--surface-bubble-mine-ink\);/u,
  )
  assert.doesNotMatch(appCss, /\.bubble\.mine\.has-delivery-issue\s*\{[\s\S]*#b97c50/u)
  assert.doesNotMatch(appCss, /\.bubble\.mine\.delivery-failed\s*\{[\s\S]*#b06e45/u)
})

test('search pane keeps the main search heading aligned with search results heading rhythm', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const searchResolverSource = readFileSync(join(repoRoot, 'src', 'app', 'channelSearch.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(appSource, /const fallbackChannelSearchResults = orderedSubscriptionChannels/u)
  assert.match(appSource, /const liveChannelSearchResults =/u)
  assert.match(appSource, /after self-unsubscribe the channel should still be discoverable through backend preview search/u)
  assert.match(appSource, /channel results must come from backend discovery so self-unsubscribed/u)
  assert.match(appSource, /function openSearchChannelResult\(channel: ChannelSearchResult\)/u)
  assert.match(appSource, /function openSearchChannelResultAsync\(channel: ChannelSearchResult\)/u)
  assert.match(appSource, /Search results must reuse the same preview contract as channel invites/u)
  assert.match(appSource, /never fall back by title, otherwise one visible result can open another/u)
  assert.match(appSource, /resolveSearchChannelOpenTarget\(channel, subscriptionChannels, channels\)/u)
  assert.match(searchResolverSource, /prefers exact handle and never falls back by title alone/u)
  assert.match(appSource, /searchChannelDiscoveryResultsRequest\(session\.sessionToken!, trimmedQuery\)/u)
  assert.match(backendSource, /makeHttpUrl\('\/api\/channel-discovery'\)/u)
  assert.match(storeSource, /searchSubscriptionChannels\(token: string, query: string\)/u)
  assert.match(storeSource, /Channel discovery is intentionally sourced from managed channels/u)
  assert.match(storeSource, /after self-unsubscribe the channel stays searchable while preview access still exists/u)
  assert.match(storeSource, /Preview access is the single source of truth for both invite-open and search-open/u)
  assert.match(storeSource, /if \(sourceChannel\.visibility === 'public'\)/u)
  assert.match(appSource, /<label className="search">[\s\S]*<span className="search-label">Поиск<\/span>[\s\S]*placeholder="Имя, канал или @handle"/u)
  assert.match(appSource, /<p className="search-group-title">Каналы<\/p>/u)
  assert.match(appSource, /onClick=\{\(\) => openSearchChannelResult\(channel\)\}/u)
  assert.doesNotMatch(appSource, /channelSearchResults\.map\(\(channel\) => \([\s\S]{0,1200}onClick=\{\(\) => openSubscriptionChannelCard\(channel\)\}/u)
  assert.match(appSource, /<p className="search-group-title">Результаты поиска<\/p>/u)
  assert.match(appSource, /Попробуйте имя, номер, канал или @handle/u)
  assert.match(handoffDoc, /search-flow канала считается таким же строгим preview-контрактом, как и invite-flow/u)
  assert.match(handoffDoc, /после self-unsubscribe канал не должен пропадать из поиска/u)
  assert.match(rolloutDoc, /после self-unsubscribe канал всё ещё находится по названию или `@handle`/u)
  assert.match(appCss, /\.search\s*\{[\s\S]*gap:\s*10px;[\s\S]*margin-top:\s*6px;[\s\S]*margin-bottom:\s*2px;/u)
  assert.match(appCss, /\.search > \.search-label\s*\{[\s\S]*letter-spacing:\s*0\.12em;[\s\S]*text-transform:\s*uppercase;/u)
  assert.match(appCss, /\.search-results\s*\{[\s\S]*padding-top:\s*2px;/u)
})

test('contacts section headings keep the same heading rhythm as the main search pane', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appCss, /\.room-forward-section-title\.contacts-section-title\s*\{[\s\S]*padding:\s*4px 4px 0;[\s\S]*font-size:\s*0\.82rem;[\s\S]*font-weight:\s*400;[\s\S]*letter-spacing:\s*0\.12em;/u)
  assert.match(appCss, /\.contacts-section:first-child \.room-forward-section-title\.contacts-section-title\s*\{[\s\S]*padding-top:\s*4px;/u)
})

test('contacts and requisites page stays aligned with public legal documents', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const contactsPageSource = readFileSync(join(repoRoot, 'src', 'ContactsPage.tsx'), 'utf8')

  assert.match(contactsPageSource, /const contactsUpdatedAt = '26 марта 2026'/u)
  assert.match(contactsPageSource, /ИП Мерзляков Алексей Сергеевич/u)
  assert.match(contactsPageSource, /ИНН: 100485269510/u)
  assert.match(contactsPageSource, /ОГРНИП: 326774600067696/u)
  assert.match(contactsPageSource, /tinychok\.help@yandex\.com/u)
  assert.match(contactsPageSource, /devisjjones@gmail\.com/u)
  assert.match(contactsPageSource, /Физическая доставка товаров не осуществляется\./u)
  assert.match(
    contactsPageSource,
    /Доступ к цифровому продукту и premium-функциям активируется онлайн после успешной оплаты\./u,
  )
  assert.doesNotMatch(contactsPageSource, /YooKassa/u)
  assert.doesNotMatch(contactsPageSource, /Для YooKassa/u)
})

test('all public legal pages keep static routes, public pdf assets and stable source comments', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const viteConfigSource = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')
  const privacySource = readFileSync(join(repoRoot, 'src', 'privacyPolicyContent.ts'), 'utf8')
  const agreementSource = readFileSync(join(repoRoot, 'src', 'userAgreementContent.ts'), 'utf8')
  const premiumSource = readFileSync(join(repoRoot, 'src', 'premiumTermsContent.ts'), 'utf8')
  const contactsSource = readFileSync(join(repoRoot, 'src', 'ContactsPage.tsx'), 'utf8')
  const premiumPageSource = readFileSync(join(repoRoot, 'src', 'PremiumTermsPage.tsx'), 'utf8')
  const privacyPageSource = readFileSync(join(repoRoot, 'src', 'PrivacyPolicyPage.tsx'), 'utf8')
  const refundPolicySource = readFileSync(join(repoRoot, 'src', 'refundPolicyContent.ts'), 'utf8')
  const refundPolicyPageSource = readFileSync(join(repoRoot, 'src', 'RefundPolicyPage.tsx'), 'utf8')
  const agreementPageSource = readFileSync(join(repoRoot, 'src', 'UserAgreementPage.tsx'), 'utf8')

  assert.match(viteConfigSource, /contacts: resolve\(viteConfigDir, 'contacts\.html'\)/u)
  assert.match(viteConfigSource, /privacyPolicy: resolve\(viteConfigDir, 'privacy-policy\.html'\)/u)
  assert.match(viteConfigSource, /refundPolicy: resolve\(viteConfigDir, 'refund-policy\.html'\)/u)
  assert.match(viteConfigSource, /userAgreement: resolve\(viteConfigDir, 'user-agreement\.html'\)/u)
  assert.match(viteConfigSource, /premiumTerms: resolve\(viteConfigDir, 'premium-terms\.html'\)/u)

  assert.ok(existsSync(join(repoRoot, 'contacts.html')))
  assert.ok(existsSync(join(repoRoot, 'privacy-policy.html')))
  assert.ok(existsSync(join(repoRoot, 'refund-policy.html')))
  assert.ok(existsSync(join(repoRoot, 'user-agreement.html')))
  assert.ok(existsSync(join(repoRoot, 'premium-terms.html')))

  assert.ok(existsSync(join(repoRoot, 'public', 'privacy-policy.pdf')))
  assert.ok(existsSync(join(repoRoot, 'public', 'user-agreement.pdf')))
  assert.ok(existsSync(join(repoRoot, 'public', 'premium-terms.pdf')))

  assert.match(privacySource, /Release-blocking legal source for `\/privacy-policy\.html` and `\/privacy-policy\.pdf`\./u)
  assert.match(agreementSource, /Release-blocking legal source for `\/user-agreement\.html` and `\/user-agreement\.pdf`\./u)
  assert.match(premiumSource, /Release-blocking legal source for `\/premium-terms\.html` and `\/premium-terms\.pdf`\./u)
  assert.match(refundPolicySource, /Release-blocking legal source for `\/refund-policy\.html`\./u)
  assert.match(contactsSource, /Public requisites page for users, payment providers and legal references\./u)

  assert.match(privacyPageSource, /Legal pages are public compliance surfaces\./u)
  assert.match(agreementPageSource, /Legal pages are public compliance surfaces\./u)
  assert.match(premiumPageSource, /Premium checkout relies on this public page and PDF\./u)
  assert.match(refundPolicyPageSource, /Premium checkout relies on this public page\./u)
})

test('favicon and home-screen icon contract stays wired to the new logo assets', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const deployScriptSource = readFileSync(join(repoRoot, 'scripts', 'deploy-staging.sh'), 'utf8')
  const staticVerifySource = readFileSync(join(repoRoot, 'scripts', 'verify-web-static-assets.mjs'), 'utf8')
  const htmlEntries = [
    'index.html',
    'contacts.html',
    'privacy-policy.html',
    'refund-policy.html',
    'user-agreement.html',
    'premium-terms.html',
    'avatar-upload-rules.html',
  ]
  const manifestSource = readFileSync(join(repoRoot, 'public', 'manifest.webmanifest'), 'utf8')
  const manifest = JSON.parse(manifestSource) as {
    icons?: Array<{ src?: string; purpose?: string; sizes?: string }>
  }

  for (const entry of htmlEntries) {
    const htmlSource = readFileSync(join(repoRoot, entry), 'utf8')
    assert.match(htmlSource, /rel="icon" type="image\/x-icon" href="\/favicon\.ico\?v=20260409" sizes="any"/u)
    assert.match(htmlSource, /rel="shortcut icon" href="\/favicon\.ico\?v=20260409"/u)
    assert.match(htmlSource, /rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32x32\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16x16\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="icon" type="image\/png" sizes="192x192" href="\/logo\/squad\/192squad\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="icon" type="image\/png" sizes="512x512" href="\/logo\/squad\/512squad\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="apple-touch-icon-precomposed" sizes="180x180" href="\/apple-touch-icon-precomposed\.png\?v=20260409"/u)
    assert.match(htmlSource, /rel="manifest" href="\/manifest\.webmanifest\?v=20260409"/u)
    assert.match(htmlSource, /name="apple-mobile-web-app-title" content="Тайничок"/u)
  }

  assert.equal(manifest.icons?.some((icon) => icon.src === '/logo/squad/16squad.png' && icon.purpose === 'any'), true)
  assert.equal(manifest.icons?.some((icon) => icon.src === '/logo/squad/32squad.png' && icon.purpose === 'any'), true)
  assert.equal(manifest.icons?.some((icon) => icon.src === '/logo/squad/192squad.png' && icon.purpose === 'any'), true)
  assert.equal(manifest.icons?.some((icon) => icon.src === '/logo/squad/512squad.png' && icon.purpose === 'any'), true)
  assert.equal(
    manifest.icons?.some((icon) => icon.src === '/logo/round/192round.png' && icon.purpose === 'maskable'),
    true,
  )
  assert.equal(
    manifest.icons?.some((icon) => icon.src === '/logo/round/512round.png' && icon.purpose === 'maskable'),
    true,
  )
  assert.ok(existsSync(join(repoRoot, 'public', 'favicon.ico')))
  assert.ok(existsSync(join(repoRoot, 'public', 'favicon-32x32.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'favicon-16x16.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'apple-touch-icon.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'apple-touch-icon-precomposed.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'squad', '16squad.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'squad', '32squad.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'squad', '64squad.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'squad', '192squad.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'squad', '512squad.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'round', '192round.png')))
  assert.ok(existsSync(join(repoRoot, 'public', 'logo', 'round', '512round.png')))
  assert.match(deployScriptSource, /verify-web-static-assets\.mjs/u)
  assert.match(staticVerifySource, /application\/manifest\+json/u)
  assert.match(staticVerifySource, /apple-touch icon/u)
  assert.match(staticVerifySource, /favicon 32x32/u)
  assert.match(staticVerifySource, /192x192/u)
  assert.match(staticVerifySource, /512x512/u)
})

test('staging deploy proof resolves the live lazy app asset chain instead of guessing css filenames', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const deployScriptSource = readFileSync(join(repoRoot, 'scripts', 'deploy-staging.sh'), 'utf8')
  const liveAssetVerifySource = readFileSync(join(repoRoot, 'scripts', 'verify-live-app-assets.mjs'), 'utf8')

  assert.match(deployScriptSource, /verify-live-app-assets\.mjs/u)
  assert.match(liveAssetVerifySource, /main-\[\^"\]\+\\\.js/u)
  assert.match(liveAssetVerifySource, /assets\\\/\(\?:App\|AdminApp\)-/u)
  assert.match(liveAssetVerifySource, /user app js/u)
  assert.match(liveAssetVerifySource, /user app css/u)
  assert.match(liveAssetVerifySource, /admin app js/u)
  assert.match(liveAssetVerifySource, /admin app css/u)
  assert.match(liveAssetVerifySource, /actual lazy-loaded app assets, not guessed filenames/u)
})

test('avatar upload rules keep moderation, removal and blocking contract explicit', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCssSource = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const avatarRulesPageSource = readFileSync(join(repoRoot, 'src', 'AvatarUploadRulesPage.tsx'), 'utf8')
  const adminSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const mediaSource = readFileSync(join(repoRoot, 'server', 'src', 'media.ts'), 'utf8')
  const agreementContentSource = readFileSync(join(repoRoot, 'src', 'userAgreementContent.ts'), 'utf8')

  assert.match(appSource, /href="\/avatar-upload-rules\.html"/u)
  assert.match(appSource, /Правила загрузки аватарки/u)
  assert.match(
    appCssSource,
    /\.channel-title-popover-actions\.channel-avatar-picker-actions\s*\{[\s\S]*?justify-content:\s*space-between;/u,
  )
  assert.match(avatarRulesPageSource, /const avatarUploadRulesUpdatedAt = '03 апреля 2026'/u)
  assert.match(avatarRulesPageSource, /Правила относятся к аватаркам пользователя, каналов и групп/u)
  assert.match(avatarRulesPageSource, /Аватарка считается пользовательским контентом/u)
  assert.match(avatarRulesPageSource, /Tinychok вправе, но не обязан, проверять аватарки до или после публикации/u)
  assert.match(avatarRulesPageSource, /вправе удалить аватарку без предварительного уведомления/u)
  assert.match(avatarRulesPageSource, /полностью заблокировать пользователя/u)
  assert.match(avatarRulesPageSource, /может сохранять сведения о жалобе, действиях команды, времени модерации/u)
  assert.match(avatarRulesPageSource, /повторно загружает запрещённые аватарки/u)
  assert.match(avatarRulesPageSource, /не одобряет и не инициирует пользовательские аватарки заранее/u)
  assert.match(avatarRulesPageSource, /изображение и понимает ответственность за его содержание\./u)
  assert.doesNotMatch(avatarRulesPageSource, /MVP-версии сервиса/u)
  assert.match(avatarRulesPageSource, /переданы в правовую проверку/u)
  assert.match(avatarRulesPageSource, /практикой модерации/u)
  assert.match(avatarRulesPageSource, /журналом действий команды/u)
  assert.match(adminSource, /Причина просмотра аватарки/u)
  assert.match(adminSource, /Причина блокировки/u)
  assert.match(adminSource, /handleModerateMedia\(item, 'hide'\)/u)
  assert.match(adminSource, /handleModerateMedia\(item, 'delete'\)/u)
  assert.match(storeSource, /action: 'admin\.user\.avatar\.view'/u)
  assert.match(storeSource, /action: 'admin\.user\.block'/u)
  assert.match(storeSource, /account\.avatarImage = undefined/u)
  assert.match(storeSource, /group\.avatarImage = undefined/u)
  assert.match(storeSource, /channel\.avatarImage = undefined/u)
  assert.match(mediaSource, /Для аватарки поддерживаются только JPG, PNG и WebP/u)
  assert.match(mediaSource, /Максимальный размер аватарки 5 МБ/u)
  assert.match(mediaSource, /Не удалось проверить изображение для аватарки/u)
  assert.match(agreementContentSource, /Пользователь самостоятельно создает, размещает, передает и удаляет Контент/u)
  assert.match(agreementContentSource, /удалять, скрывать, ограничивать доступ к Контенту/u)
  assert.match(agreementContentSource, /блокировать Аккаунт, канал, группу или иной объект Сервиса/u)
})

test('staging frontend build contract protects against same-origin api auth loops', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const packageJson = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const deployScript = readFileSync(join(repoRoot, 'scripts', 'deploy-staging.sh'), 'utf8')
  const verifyScript = readFileSync(join(repoRoot, 'scripts', 'verify-staging-dist.mjs'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.ok(existsSync(join(repoRoot, 'scripts', 'verify-staging-dist.mjs')))
  assert.match(packageJson, /"build:staging": "tsc -b && npm run build:server && npm run build:frontend:staging && npm run verify:staging-dist"/u)
  assert.match(packageJson, /"build:frontend:staging": "VITE_API_BASE_URL=https:\/\/api\.staging\.tinychok\.ru VITE_WS_BASE_URL=wss:\/\/api\.staging\.tinychok\.ru vite build"/u)
  assert.match(packageJson, /"audit:release": "npm audit --audit-level=high"/u)
  assert.match(packageJson, /"verify:staging-dist": "node scripts\/verify-staging-dist\.mjs"/u)

  assert.match(verifyScript, /const stagingApiBaseUrl = 'https:\/\/api\.staging\.tinychok\.ru'/u)
  assert.match(verifyScript, /const stagingWsBaseUrl = 'wss:\/\/api\.staging\.tinychok\.ru'/u)
  assert.match(verifyScript, /index\.html does not reference a main frontend bundle/u)
  assert.match(verifyScript, /no staged JS asset contains/u)
  assert.match(verifyScript, /same-origin \/api and re-open nginx basic-auth prompts/u)
  assert.match(verifyScript, /Realtime on staging must always point to the dedicated api\.staging websocket host/u)

  assert.match(deployScript, /Staging must never be deployed from plain `npm run build` output\./u)
  assert.match(deployScript, /Chrome re-opens nginx basic auth/u)
  assert.match(deployScript, /npm run build:staging/u)
  assert.match(deployScript, /ensure_clean_worktree/u)
  assert.match(deployScript, /ensure_origin_remote_contract/u)
  assert.match(deployScript, /Staging deploy requires a clean commit-backed worktree\./u)
  assert.match(deployScript, /Staging deploy requires origin to point directly at github\.com/u)
  assert.match(deployScript, /npm run audit:release/u)

  assert.match(backendSource, /Staging frontend must be built with explicit VITE_API_BASE_URL/u)
  assert.match(backendSource, /same-origin `\/api`, the web host can re-open nginx basic-auth prompts in a loop/u)
  assert.match(backendSource, /Realtime on staging must always point to the dedicated api\.staging host too\./u)

  assert.match(handoffDoc, /staging frontend нельзя выкатывать из plain `npm run build`/u)
  assert.match(handoffDoc, /Chrome зацикливает окно логина/u)
  assert.match(handoffDoc, /staging\.tinychok\.ru\/api\/\*` и `staging\.tinychok\.ru\/ws` должны проксироваться/u)
  assert.match(handoffDoc, /git@github\.com:devisjjones\/tinychok\.git/u)

  assert.match(rolloutDoc, /только `npm run build:staging`/u)
  assert.match(rolloutDoc, /endless basic-auth prompt/u)
  assert.match(rolloutDoc, /staging\.tinychok\.ru\/api\/client-config/u)
  assert.match(rolloutDoc, /expected result = JSON runtime config, а не `index\.html`/u)
  assert.match(rolloutDoc, /expected result = обычный JSON `401` от backend/u)
  assert.match(rolloutDoc, /git@github\.com:devisjjones\/tinychok\.git/u)
})

test('runbooks keep the autotest gate explicit before final answers and staging deploys', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const packageJson = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const newThreadRunbook = readFileSync(join(repoRoot, 'docs', 'new-thread-runbook.md'), 'utf8')
  const collaborationDoc = readFileSync(join(repoRoot, 'docs', 'collaboration-instructions.md'), 'utf8')
  const deployRunbook = readFileSync(join(repoRoot, 'docs', 'staging-deploy-runbook.md'), 'utf8')

  assert.match(packageJson, /"test:ui-contracts": "node --test --import tsx server\/src\/ui-runtime-regressions\.test\.ts"/u)
  assert.match(packageJson, /"test:gate": "npm test && npm run audit:release && npm run build:staging"/u)

  assert.match(newThreadRunbook, /быстрый контрактный прогон во время работы: `npm run test:ui-contracts`/u)
  assert.match(newThreadRunbook, /перед финальным ответом и любым staging deploy: `npm run test:gate`/u)
  assert.match(
    newThreadRunbook,
    /нельзя писать `готово`, `исправлено` или `задеплоено`, пока локально не зелёный `npm run test:gate`/iu,
  )

  assert.match(collaborationDoc, /## Границы Этого Файла/u)
  assert.match(collaborationDoc, /обязательный `test:gate`/u)
  assert.match(
    collaborationDoc,
    /эти правила живут только в \[docs\/new-thread-runbook\.md\]/u,
  )
  assert.match(collaborationDoc, /как формулировать проверки и smoke-сценарии/u)

  assert.match(deployRunbook, /быстрый контрактный прогон при работе: `npm run test:ui-contracts`/u)
  assert.match(deployRunbook, /обязательный gate перед push и deploy: `npm run test:gate`/u)
})

test('main entry lazy-loads user and admin frontends to keep the staging bootstrap bundle split', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const mainSource = readFileSync(join(repoRoot, 'src', 'main.tsx'), 'utf8')

  assert.match(mainSource, /lazy\(\(\) => import\('\.\/App\.tsx'\)\)/u)
  assert.match(mainSource, /lazy\(\(\) => import\('\.\/AdminApp\.tsx'\)\)/u)
  assert.match(mainSource, /<Suspense fallback=\{null\}>/u)
  assert.doesNotMatch(mainSource, /import App from '\.\/App\.tsx'/u)
  assert.doesNotMatch(mainSource, /import AdminApp from '\.\/AdminApp\.tsx'/u)
})

test('analytics and release runtime contracts stay explicit in env examples, deploy flow and docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const packageJson = readFileSync(join(repoRoot, 'package.json'), 'utf8')
  const deployScript = readFileSync(join(repoRoot, 'scripts', 'deploy-staging.sh'), 'utf8')
  const verifyRuntimeScript = readFileSync(join(repoRoot, 'scripts', 'verify-runtime-client-config.mjs'), 'utf8')
  const verifyReleaseScript = readFileSync(join(repoRoot, 'scripts', 'verify-release-runtime.mjs'), 'utf8')
  const stagingEnvExample = readFileSync(join(repoRoot, '.env.staging.example'), 'utf8')
  const productionEnvExample = readFileSync(join(repoRoot, '.env.production.example'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.ok(existsSync(join(repoRoot, 'scripts', 'verify-runtime-client-config.mjs')))
  assert.ok(existsSync(join(repoRoot, 'scripts', 'verify-release-runtime.mjs')))
  assert.ok(existsSync(join(repoRoot, 'docs', 'release-contracts.md')))
  assert.match(packageJson, /"verify:staging-runtime": "node scripts\/verify-release-runtime\.mjs --client-config-url https:\/\/api\.staging\.tinychok\.ru\/api\/client-config --health-url https:\/\/api\.staging\.tinychok\.ru\/healthz --ready-url https:\/\/api\.staging\.tinychok\.ru\/readyz --require-analytics --expected-metrica-counter-id 108249405"/u)

  for (const envSource of [stagingEnvExample, productionEnvExample]) {
    assert.match(envSource, /TINYCHOK_ANALYTICS_ENABLED=true/u)
    assert.match(envSource, /TINYCHOK_ANALYTICS_PROVIDER=log/u)
    assert.match(envSource, /TINYCHOK_ANALYTICS_FLUSH_INTERVAL_MS=5000/u)
    assert.match(envSource, /TINYCHOK_ANALYTICS_MAX_BATCH_SIZE=20/u)
    assert.match(envSource, /TINYCHOK_YANDEX_METRICA_COUNTER_ID=change-me/u)
  }

  assert.match(deployScript, /Verifying staging runtime release contracts/u)
  assert.match(deployScript, /expected counter id\s+108249405/u)
  assert.match(deployScript, /verify-release-runtime\.mjs/u)
  assert.match(deployScript, /wait_for_staging_runtime_release/u)
  assert.match(deployScript, /Runtime not ready yet; retrying release verification/u)
  assert.match(deployScript, /--require-analytics/u)
  assert.match(deployScript, /--health-url https:\/\/api\.staging\.tinychok\.ru\/healthz/u)
  assert.match(deployScript, /--ready-url https:\/\/api\.staging\.tinychok\.ru\/readyz/u)
  assert.match(deployScript, /--expected-metrica-counter-id 108249405/u)

  assert.match(verifyRuntimeScript, /Missing required --url/u)
  assert.match(verifyRuntimeScript, /Runtime config analytics\.enabled=false/u)
  assert.match(verifyRuntimeScript, /analytics\.provider must stay "log"/u)
  assert.match(verifyRuntimeScript, /metricaCounterId is missing/u)
  assert.match(verifyRuntimeScript, /publicUrls/u)
  assert.match(verifyRuntimeScript, /verifiedUrl/u)

  assert.match(verifyReleaseScript, /Missing required --client-config-url/u)
  assert.match(verifyReleaseScript, /healthz/u)
  assert.match(verifyReleaseScript, /readyz/u)
  assert.match(verifyReleaseScript, /analytics\.enabled=false/u)
  assert.match(verifyReleaseScript, /metricaCounterId mismatch/u)
  assert.match(verifyReleaseScript, /verifiedClientConfigUrl/u)

  assert.match(handoffDoc, /staging и production не должны тихо запускаться с `analytics\.disabled`/u)
  assert.match(handoffDoc, /108249405/u)
  assert.match(handoffDoc, /TINYCHOK_YANDEX_METRICA_COUNTER_ID/u)
  assert.match(handoffDoc, /analytics regressions ловятся только через runtime config smoke-check/u)
  assert.match(handoffDoc, /docs\/release-contracts\.md/u)

  assert.match(rolloutDoc, /Staging Analytics Guard/u)
  assert.match(rolloutDoc, /GET https:\/\/api\.staging\.tinychok\.ru\/api\/client-config/u)
  assert.match(rolloutDoc, /108249405/u)
  assert.match(rolloutDoc, /expected result = JSON with positive `analytics\.metricaCounterId`/u)
  assert.match(rolloutDoc, /\?analytics_debug=1/u)

  assert.match(releaseContractsDoc, /Release Contracts/u)
  assert.match(releaseContractsDoc, /108249405/u)
  assert.match(releaseContractsDoc, /npm run verify:staging-runtime/u)
  assert.match(releaseContractsDoc, /`В сети` = только живое websocket-соединение/u)
  assert.match(releaseContractsDoc, /Direct Delete-For-Everyone Contract/u)
})

test('stale runtime recovery stays explicit in source, runtime config and rollout docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const viteConfigSource = readFileSync(join(repoRoot, 'vite.config.ts'), 'utf8')
  const viteEnvSource = readFileSync(join(repoRoot, 'src', 'vite-env.d.ts'), 'utf8')
  const serverConfigSource = readFileSync(join(repoRoot, 'server', 'src', 'config.ts'), 'utf8')
  const serverIndexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.match(sharedBackendSource, /release:\s*\{[\s\S]*buildId:\s*string/u)
  assert.match(backendSource, /function makeNoStoreReadRequestInit\(token\?: string\)/u)
  assert.match(backendSource, /cache:\s*'no-store'/u)
  assert.match(backendSource, /fetch\(makeHttpUrl\('\/api\/client-config'\), makeNoStoreReadRequestInit\(\)\)/u)
  assert.match(backendSource, /fetch\(makeHttpUrl\('\/api\/bootstrap'\), makeNoStoreReadRequestInit\(sessionToken\)\)/u)

  assert.match(viteConfigSource, /__TINYCHOK_FRONTEND_BUILD_ID__/u)
  assert.match(viteConfigSource, /git', \['rev-parse', '--short', 'HEAD'\]/u)
  assert.match(viteEnvSource, /declare const __TINYCHOK_FRONTEND_BUILD_ID__: string/u)

  assert.match(serverConfigSource, /function readBuildId\(env: RuntimeEnv\)/u)
  assert.match(serverConfigSource, /release:\s*\{[\s\S]*buildId:\s*readBuildId\(env\)/u)
  assert.match(serverIndexSource, /pathname !== '\/api\/media\/preview'/u)
  assert.match(serverIndexSource, /Cache-Control', 'no-store, max-age=0, must-revalidate'/u)
  assert.match(serverIndexSource, /release:\s*\{[\s\S]*buildId:\s*runtimeConfig\.release\.buildId/u)

  assert.match(appSource, /STALE_RUNTIME_RECOVERY_INTERVAL_MS = 15_000/u)
  assert.match(appSource, /triggerOneShotRuntimeReload/u)
  assert.match(appSource, /nextConfig\.release\.buildId !== __TINYCHOK_FRONTEND_BUILD_ID__/u)
  assert.match(appSource, /window\.addEventListener\('pageshow', handlePageshow\)/u)
  assert.match(appSource, /window\.addEventListener\('focus', handleFocus\)/u)
  assert.match(appSource, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/u)
  assert.match(appSource, /fetchBootstrap\(sessionToken\)/u)

  assert.match(handoffDoc, /runtime self-heal contract для stale mobile\/browser tabs:/u)
  assert.match(handoffDoc, /release\.buildId/u)
  assert.match(handoffDoc, /Cache-Control: no-store/u)
  assert.match(rolloutDoc, /### Stale Runtime Recovery Guard/u)
  assert.match(rolloutDoc, /client-config` и `GET https:\/\/api\.staging\.tinychok\.ru\/api\/bootstrap` должны возвращать anti-cache headers/u)
  assert.match(rolloutDoc, /pageshow` \/ `focus` \/ `visibilitychange`/u)
  assert.match(releaseContractsDoc, /stale runtime recovery тоже считается release-blocking контрактом:/u)
  assert.match(releaseContractsDoc, /release\.buildId/u)
  assert.match(releaseContractsDoc, /Cache-Control: no-store/u)
})

test('postgres hybrid runtime layout stays explicit in source, sql and rollout docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const storeFactorySource = readFileSync(join(repoRoot, 'server', 'src', 'store-factory.ts'), 'utf8')
  const indexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const hybridSql = readFileSync(
    join(repoRoot, 'server', 'sql', 'yandex-postgres-hybrid-runtime.sql'),
    'utf8',
  )
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')

  assert.ok(existsSync(join(repoRoot, 'server', 'sql', 'yandex-postgres-hybrid-runtime.sql')))

  assert.match(storeFactorySource, /stripHybridCollectionsFromDatabase/u)
  assert.match(storeFactorySource, /buildHybridCollectionsSnapshot/u)
  assert.match(storeFactorySource, /hydrateDatabaseWithHybridCollections/u)
  assert.match(storeFactorySource, /storageLayout: 'hybrid-normalized'/u)
  assert.match(storeFactorySource, /createEmptyHybridCollections/u)
  assert.match(storeFactorySource, /createEmptyHybridRowPresence/u)
  assert.match(storeFactorySource, /rowPresence\[(?:definition\.name|name)\] = \((?:result\.rowCount \?\? 0)\) > 0|rowPresence\[(?:definition\.name|name)\] = result\.rowCount > 0/u)
  assert.match(storeFactorySource, /if \(loadedHybridCollections\.rowPresence\[name\]\)/u)
  assert.match(storeFactorySource, /accountStatusHistories/u)
  assert.match(storeFactorySource, /app_runtime_state_support_tickets|support_tickets/u)

  assert.match(indexSource, /layout: storeMetadata\.storageLayout \?\? 'state-store'/u)

  assert.match(hybridSql, /create table if not exists app_runtime_state \(/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_dialog_messages/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_group_messages/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_groups/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_subscription_channels/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_subscription_posts/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_support_tickets/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_thread_states/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_ip_access_logs/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_admin_audit_logs/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_archived_media/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_pending_group_invitations/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_pending_channel_invitations/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_pending_media_uploads/u)
  assert.match(hybridSql, /create table if not exists app_runtime_state_account_status_histories/u)

  assert.match(handoffDoc, /hybrid-normalized/u)
  assert.match(handoffDoc, /app_runtime_state_dialog_messages/u)
  assert.match(handoffDoc, /app_runtime_state_account_status_histories/u)
  assert.match(handoffDoc, /per-collection/u)
  assert.match(rolloutDoc, /readyz\.storage\.layout/u)
  assert.match(rolloutDoc, /"layout":"hybrid-normalized"/u)
  assert.match(rolloutDoc, /app_runtime_state_pending_media_uploads/u)
  assert.match(releaseContractsDoc, /PostgreSQL Hybrid Runtime Layout/u)
  assert.match(releaseContractsDoc, /app_runtime_state_subscription_posts/u)
  assert.match(releaseContractsDoc, /app_runtime_state_subscription_channels/u)
  assert.match(releaseContractsDoc, /app_runtime_state_account_status_histories/u)
  assert.match(releaseContractsDoc, /hybrid-таблиц не должно молча терять данные старого postgres-state/u)
})

test('snapshot and attachment security boundaries stay explicit in source', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const serverSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(serverSource, /Snapshot sync is not an account\/session source of truth/u)
  assert.doesNotMatch(serverSource, /account\.premium = snapshot\.session\.premium/u)
  assert.doesNotMatch(serverSource, /account\.premiumExpiresAt = snapshot\.session\.premiumExpiresAt/u)
  assert.doesNotMatch(serverSource, /account\.avatarImage = snapshot\.session\.avatarImage/u)
  assert.doesNotMatch(serverSource, /account\.blockedContactIds = \[\.\.\.\(snapshot\.session\.blockedContactIds/u)
  assert.doesNotMatch(serverSource, /account\.quietModeSettings = normalizeQuietModeSettings\(\s*snapshot\.session\.quietModeSettings/u)
  assert.doesNotMatch(serverSource, /account\.invisibilityEnabled = snapshot\.session\.invisibilityEnabled/u)
  assert.match(serverSource, /private assertOwnedPendingAttachment\(/u)
  assert.match(serverSource, /mediaUrl` is client-provided metadata, not proof of ownership/u)
  assert.match(serverSource, /Every successful send-path must land here/u)
  assert.match(serverSource, /this\.assertOwnedPendingAttachment\(account\.identifier, payload\.attachment\)/u)
  assert.match(serverSource, /this\.assertOwnedPendingAttachment\(actor\.identifier, payload\.attachment\)/u)
  assert.match(serverSource, /this\.markAttachmentUploadLinked\(attachment\)/u)
})

test('realtime auth, session ttl and delivery idempotency stay explicit in source', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const serverSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const indexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const releaseContractsDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  assert.match(serverSource, /const SESSION_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1000/u)
  assert.match(serverSource, /expiresAt: new Date\(Date\.now\(\) \+ SESSION_TTL_MS\)\.toISOString\(\)/u)
  assert.match(serverSource, /private getActiveSessionRecord\(token: string\)/u)
  assert.match(serverSource, /const expiresAt = parseIsoDate\(session\.expiresAt\)/u)
  assert.match(serverSource, /keepToken: token/u)
  assert.match(serverSource, /normalizeClientDeliveryId/u)
  assert.match(serverSource, /findExistingDirectMessageByDeliveryId/u)
  assert.match(serverSource, /findExistingGroupMessageByDeliveryId/u)
  assert.match(serverSource, /findExistingSupportTicketByDeliveryId/u)
  assert.match(serverSource, /findExistingSubscriptionPostByDeliveryId/u)
  assert.match(serverSource, /return this\.buildSnapshot\(existingAccount, token\)/u)

  assert.match(indexSource, /function isAllowedRealtimeOrigin\(origin: string \| undefined\)/u)
  assert.match(indexSource, /Query-token auth is still the legacy transport for v1 realtime, so origin-check is mandatory/u)
  assert.match(indexSource, /const socketsByToken = new Map<string, Map<string, LiveSocket>>\(\)/u)
  assert.match(indexSource, /function closeLiveSocketsForToken/u)
  assert.match(indexSource, /function hasLiveSocketsForToken/u)
  assert.match(indexSource, /const baseSnapshot = store\.getRealtimeSnapshotByIdentifier\(identifier\)/u)
  assert.match(indexSource, /sessionToken: token/u)
  assert.match(indexSource, /id: randomUUID\(\)/u)
  assert.match(indexSource, /if \(!hasLiveSocketsForToken\(token\)\) \{\s*broadcastPresenceChangesForToken\(token, 'offline'\)/u)

  assert.match(releaseContractsDoc, /Session TTL = 30 days/u)
  assert.match(releaseContractsDoc, /password change\/reset revokes every other session/u)
  assert.match(releaseContractsDoc, /одинаковый `clientDeliveryId` в одном и том же surface считается успешным no-op/u)
  assert.match(releaseContractsDoc, /snapshot fan-out builds once per identifier and reuses that payload across live tokens/u)
  assert.match(handoffDoc, /websocket reconnect must never let a stale close event mark a newer live socket offline/u)
  assert.match(handoffDoc, /query-token websocket auth is legacy and must stay behind strict origin allowlisting/u)
  assert.match(rolloutDoc, /session expiry now applies equally to HTTP bootstrap and websocket realtime/u)
  assert.match(rolloutDoc, /duplicate retries with the same `clientDeliveryId` no longer create duplicate messages/u)
})

test('thread back restores the source group or channel surface instead of leaving the thread inbox active', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /Thread back should restore the source room surface too/u)
  assert.match(appSource, /if \(previousThreadTarget\?\.kind === 'group'\) \{[\s\S]*openGroup\(previousThreadTarget\.groupId\)/u)
  assert.match(
    appSource,
    /if \(previousThreadTarget\?\.kind === 'channel'\) \{[\s\S]*openSubscriptionChannel\(previousThreadTarget\.channelId\)/u,
  )
})

test('admin user search collapses deleted archived phone duplicates behind the active account', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(storeSource, /Admin user search should show one row per real phone identity by default/u)
  assert.match(storeSource, /A deleted self-service archived account can legitimately coexist/u)
})

test('admin user detail keeps status in a dedicated field and exposes csv export for full status history', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const routeSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-routes.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.doesNotMatch(
    adminAppSource,
    /user\.status \|\| \(user\.blocked \? 'Заблокирован' : formatUserRole\(user\.staffRole\)\)/u,
  )
  assert.match(adminAppSource, /Статус пользователя/u)
  assert.match(adminAppSource, /IP-история/u)
  assert.match(adminAppSource, /handleDownloadUserIpLogsCsv/u)
  assert.match(adminAppSource, /Смен IP:/u)
  assert.doesNotMatch(adminAppSource, />\s*Логи IP\s*</u)
  assert.match(adminAppSource, /handleDownloadUserStatusHistoryCsv/u)
  assert.match(adminAppSource, /\/icons\/dwnl\.png/u)
  assert.match(backendSource, /\/api\/admin\/users\/\$\{encodeURIComponent\(identifier\)\}\/status-history\/export/u)
  assert.match(routeSource, /\/api\/admin\/users\/:identifier\/status-history\/export/u)
  assert.match(storeSource, /adminExportUserStatusHistoryCsv/u)
  assert.match(storeSource, /normalizeAccountStatusHistory/u)
})

test('admin timestamps stay pinned to Moscow time instead of the operator local browser time', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')

  assert.match(adminAppSource, /const adminDisplayTimeZone = 'Europe\/Moscow'/u)
  assert.match(adminAppSource, /Admin moderation timestamps must stay in Moscow time regardless of the operator locale\./u)
  assert.match(adminAppSource, /timeZone: adminDisplayTimeZone/u)
})

test('group admin list stays compact and detail exposes participant csv export', async () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const routeSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-routes.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const adminCssSource = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')

  assert.doesNotMatch(adminAppSource, /<span>\{group\.id\}<\/span>/u)
  assert.match(adminAppSource, /selectedGroup\.sharedId/u)
  assert.match(adminAppSource, /handleDownloadGroupParticipantsCsv/u)
  assert.match(adminAppSource, /handleToggleGroupArchive/u)
  assert.match(adminAppSource, /groupListFilter/u)
  assert.match(adminAppSource, /\/icons\/archive\.png/u)
  assert.match(adminAppSource, /\/icons\/group100\.png/u)
  assert.match(adminAppSource, /Архивированные группы/u)
  assert.match(adminAppSource, /Активные группы/u)
  assert.match(adminAppSource, /renderAdminArchiveIcon/u)
  assert.match(adminAppSource, /admin-inline-icon-title admin-inline-icon-title-archive/u)
  assert.doesNotMatch(adminAppSource, /admin-inline-icon-badge admin-inline-icon-badge-archive admin-inline-icon-badge-title/u)
  assert.match(adminAppSource, /Архивировать группу/u)
  assert.match(adminAppSource, /Разархивировать группу/u)
  assert.match(adminAppSource, /Скачать CSV участников группы/u)
  assert.match(adminAppSource, /admin-detail-inline-action/u)
  assert.match(adminAppSource, /admin-button-with-icon-archive/u)
  assert.match(adminAppSource, /groups\.archive\.manage/u)
  assert.match(adminCssSource, /\.admin-filter-tab\.archive/u)
  assert.match(adminCssSource, /\.admin-inline-icon-badge-archive/u)
  assert.match(adminCssSource, /\.admin-inline-icon-title/u)
  assert.match(adminCssSource, /\.admin-inline-icon-title-archive img/u)
  assert.match(backendSource, /\/api\/admin\/groups\/\$\{encodeURIComponent\(groupId\)\}\/participants\/export/u)
  assert.match(backendSource, /\/api\/admin\/groups\/\$\{encodeURIComponent\(groupId\)\}\/archive-toggle/u)
  assert.match(routeSource, /\/api\/admin\/groups\/:groupId\/participants\/export/u)
  assert.match(routeSource, /\/api\/admin\/groups\/:groupId\/archive-toggle/u)
  assert.match(routeSource, /broadcastSnapshotsForIdentifiers\(payload\.broadcastIdentifiers\)/u)
  assert.match(storeSource, /adminExportGroupParticipantsCsv/u)
  assert.match(storeSource, /getAdminGroupSearchRank/u)
  assert.match(storeSource, /adminSetGroupArchived/u)
  assert.match(storeSource, /archiveReason === 'admin-archived'/u)

  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990007011', { staffRole: 'owner' })
  const owner = createAccount('+79990007012')
  owner.displayName = 'Алекс Тестер'
  owner.nickname = 'alex'
  const member = createAccount('+79990007013')
  member.displayName = 'Мира Тестер'
  member.nickname = 'mira'

  database.accounts.push(actor, owner, member)
  database.groups.push({
    accent: 'earth',
    archiveReason: undefined,
    archivedAt: undefined,
    avatarImage: undefined,
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: false,
    commentsEnabledForPremium: false,
    creatorIdentifier: owner.identifier,
    description: '',
    groupOwnerIdentifier: owner.identifier,
    handle: 'test_group_export',
    id: 1,
    latestActivityAt: '2026-04-06T10:00:00.000Z',
    members: 2,
    muted: false,
    ownerIdentifier: owner.identifier,
    participants: [
      {
        accent: 'earth',
        id: 1,
        identifier: owner.identifier,
        nickname: owner.nickname,
        status: '',
        title: owner.displayName,
      },
      {
        accent: 'earth',
        id: 2,
        identifier: member.identifier,
        nickname: member.nickname,
        status: '',
        title: member.displayName,
      },
    ],
    preview: 'Группа создана.',
    sharedId: 'group-export-shared-id',
    time: '10:00',
    title: 'Тест группа CSV',
    unread: 0,
  })

  const actorToken = createSession(database, actor.identifier, 'group-participants-export-actor')
  const groupId = store.adminListGroups('Тест группа CSV')[0]?.id
  assert.ok(groupId)

  const response = await store.adminExportGroupParticipantsCsv(actorToken, groupId, 'Проверка участников')
  assert.match(response.fileName, /group-participants-/u)
  assert.match(response.csv, /"Имя","Телефон","Юзернейм"/u)
  assert.match(response.csv, /Алекс Тестер/u)
  assert.match(response.csv, /\+79990007012/u)
  assert.match(response.csv, /@alex/u)
  assert.match(response.csv, /Мира Тестер/u)
  assert.match(response.csv, /\+79990007013/u)
  assert.match(response.csv, /@mira/u)

  const archivedGroups = await store.adminSetGroupArchived(actorToken, groupId, {
    enabled: true,
    reason: 'Проверка staff архива',
  })
  const archivedSummary = archivedGroups.groups.find((group) => group.id === groupId)
  assert.ok(archivedSummary?.archivedAt)
  assert.equal(archivedSummary?.archiveReason, 'admin-archived')
  assert.deepEqual(archivedGroups.broadcastIdentifiers.sort(), [owner.identifier].sort())

  const restoredGroups = await store.adminSetGroupArchived(actorToken, groupId, {
    enabled: false,
    reason: 'Проверка снятия архива',
  })
  const restoredSummary = restoredGroups.groups.find((group) => group.id === groupId)
  assert.equal(restoredSummary?.archivedAt, undefined)
  assert.equal(restoredSummary?.archiveReason, undefined)

  assert.match(adminAppSource, /renderAdminLinkedUserButton\(selectedGroup\.owner\)/u)
  assert.match(adminCssSource, /\.admin-list-item-title-row \.(admin-inline-icon-badge|admin-inline-icon-title)/u)
  assert.match(storeSource, /lookupIdentifier: account\?\.identifier \|\| undefined/u)
  assert.match(storeSource, /getAccountOriginalIdentifier\(account\)/u)
  assert.match(adminAppSource, /admin-inline-icon-title-archive/u)
  assert.match(adminCssSource, /\.admin-list-item-title-row \.admin-inline-icon-title\.admin-inline-icon-title-archive/u)
  assert.doesNotMatch(adminAppSource, /admin-inline-icon-badge-title/u)
  assert.match(storeSource, /patchArchivedGroupOwnerSummary/u)
  assert.match(storeSource, /getArchivedGroupOwnerTitleFallback/u)
  assert.match(storeSource, /summary\.displayName === 'Удалённый аккаунт'/u)
  assert.match(storeSource, /summary\.identifier === 'Нет данных'/u)
})

test('group participants dialog wires direct-chat and contact-request actions per participant', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /const openGroupParticipantContact = useCallback/u)
  assert.match(appSource, /chat\.contactState === 'accepted'/u)
  assert.match(appSource, /void openContactRequestRoom\(participantIdentifier\)/u)
  assert.match(appSource, /src=\{actionKind === 'chat' \? '\/icons\/chat100\.png' : '\/icons\/man-raising-hand\.png'\}/u)
  assert.match(appSource, /Начать диалог с \$\{participant\.title\}/u)
  assert.match(appSource, /Открыть диалог с \$\{participant\.title\}/u)
  assert.match(appCss, /\.room-participant-action\s*\{/u)
  assert.match(appCss, /\.room-participant-action img\s*\{/u)
})

test('group participants dialog supports searchable owner moderation with remove and blacklist actions', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const indexSource = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(appSource, /const \[groupParticipantsSearchQuery, setGroupParticipantsSearchQuery\] = useState\(''\)/u)
  assert.match(appSource, /removeGroupParticipantRequest/u)
  assert.match(appSource, /blacklistGroupParticipantRequest/u)
  assert.match(appSource, /placeholder="Имя, фамилия или @никнейм"/u)
  assert.match(appSource, /setSelectedGroupParticipantIdentifier\(participantIdentifier\)/u)
  assert.match(appSource, /Удалить участника/u)
  assert.match(appSource, /В чёрный список/u)
  assert.match(appSource, /event\.stopPropagation\(\)\s*openGroupParticipantContact\(participant\)/u)
  assert.match(appCss, /\.room-participant-role-blacklisted\s*\{/u)
  assert.match(indexSource, /app\.post\('\/api\/groups\/:groupId\/participants\/remove'/u)
  assert.match(indexSource, /app\.post\('\/api\/groups\/:groupId\/participants\/blacklist'/u)
  assert.match(storeSource, /async removeGroupParticipant\(/u)
  assert.match(storeSource, /async blacklistGroupParticipant\(/u)
})

test('group and channel people dialogs expose owner invite shortcuts into the existing invite flows', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  const groupDialogStart = appSource.indexOf('const groupParticipantsDialog =')
  const groupDialogEnd = appSource.indexOf('const selectedActiveGroupParticipantDialog =')
  const channelDialogStart = appSource.indexOf(
    '{channelSubscribersOpen && currentSubscriptionChannel && isCurrentSubscriptionChannelOwner ? (',
  )
  const channelDialogEnd = appSource.indexOf(
    '{selectedCurrentSubscriptionChannelSubscriber && currentSubscriptionChannel && isCurrentSubscriptionChannelOwner ? (',
  )

  assert.ok(groupDialogStart >= 0)
  assert.ok(groupDialogEnd > groupDialogStart)
  assert.ok(channelDialogStart >= 0)
  assert.ok(channelDialogEnd > channelDialogStart)

  const groupDialogSource = appSource.slice(groupDialogStart, groupDialogEnd)
  const channelDialogSource = appSource.slice(channelDialogStart, channelDialogEnd)

  assert.match(groupDialogSource, /isActiveGroupCreator && !activeGroupArchived/u)
  assert.match(groupDialogSource, /Пригласить пользователя/u)
  assert.match(groupDialogSource, /closeGroupParticipantsDialog\(\)\s*openGroupInvitePopup\(\)/u)
  assert.match(
    groupDialogSource,
    /room-confirm-button room-confirm-button-primary\$\{activeGroupAtMemberLimit \? ' disabled' : ''\}/u,
  )

  assert.match(
    appSource,
    /function openChannelShareDialog\(\)\s*\{[\s\S]*closeChannelActions\(\)[\s\S]*setChannelShareOpen\(true\)[\s\S]*setChannelShareBusy\(false\)[\s\S]*setChannelShareError\(''\)[\s\S]*setChannelShareChatIds\(\[\]\)[\s\S]*setChannelReportOpen\(false\)[\s\S]*setChannelReportError\(''\)/u,
  )
  assert.match(channelDialogSource, /!currentSubscriptionChannelArchived/u)
  assert.match(channelDialogSource, /Пригласить пользователя/u)
  assert.match(channelDialogSource, /closeChannelSubscribersDialog\(\)\s*openChannelShareDialog\(\)/u)
})

test('admin report detail resolves reporter and related user as linked user cards', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const adminCssSource = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(sharedBackendSource, /reporter: AdminLinkedUser/u)
  assert.match(sharedBackendSource, /relatedUser\?: AdminLinkedUser/u)
  assert.match(
    storeSource,
    /reporter: buildAdminLinkedUserSummary\(reporterAccount \?\? undefined, summary\.reporterIdentifier\)/u,
  )
  assert.match(storeSource, /relatedUser: summary\.relatedUserIdentifier/u)
  assert.match(
    adminAppSource,
    /function renderAdminLinkedUserDetailCard\(user\?: AdminLinkedUser \| null, emptyLabel = 'Нет'\)/u,
  )
  assert.match(adminAppSource, /renderAdminLinkedUserDetailCard\(selectedReport\.reporter\)/u)
  assert.match(adminAppSource, /renderAdminLinkedUserDetailCard\(selectedReport\.relatedUser, 'Нет'\)/u)
  assert.match(adminAppSource, /const lookupIdentifier = user\.lookupIdentifier/u)
  assert.match(adminAppSource, /onClick=\{\(\) => void openUserFromAdmin\(lookupIdentifier\)\}/u)
  assert.match(adminCssSource, /\.admin-detail-link-card-user/u)
  assert.match(adminCssSource, /\.admin-detail-link-meta/u)
  assert.doesNotMatch(adminAppSource, /<dd>\{selectedReport\.reporterIdentifier\}<\/dd>/u)
})

test('group and thread message menus expose direct-dialog actions for other participants', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /function resolveParticipantDialogAction\(participant: GroupParticipant \| null\)/u)
  assert.match(appSource, /!chat\.hidden &&\s*normalizeIdentifier\(chat\.phone\) === participantIdentifier/u)
  assert.match(appSource, /const activeThreadCommentDialogAction = resolveParticipantDialogAction\(activeThreadCommentParticipant\)/u)
  assert.match(appSource, /const activeGroupMessageDialogAction = resolveParticipantDialogAction\(activeGroupMessageParticipant\)/u)
  assert.match(appSource, /openParticipantDialogAction\(activeThreadCommentParticipant, closeThreadCommentActions\)/u)
  assert.match(appSource, /openParticipantDialogAction\(activeGroupMessageParticipant, closeGroupMessageActions\)/u)
  assert.match(appSource, /activeThreadCommentDialogAction\.kind === 'chat' \? 'В личку' : 'Добавить'/u)
  assert.match(appSource, /activeGroupMessageDialogAction\.kind === 'chat' \? 'В личку' : 'Добавить'/u)
  assert.match(appSource, /activeThreadCommentDialogAction\.kind === 'chat'\s*\n\s*\? '\/icons\/chat100\.png'\s*\n\s*: '\/icons\/man-raising-hand\.png'/u)
  assert.match(appSource, /activeGroupMessageDialogAction\.kind === 'chat'\s*\n\s*\? '\/icons\/chat100\.png'\s*\n\s*: '\/icons\/man-raising-hand\.png'/u)
  assert.match(appCss, /\.message-menu-item-with-icon\s*\{/u)
  assert.match(appCss, /\.message-menu-item-with-icon img\s*\{/u)
})

test('admin group search prioritizes exact title and real sharedId over noisy owner phone matches', () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990007111', { staffRole: 'owner' })
  actor.displayName = 'Алекс Админ'
  const owner = createAccount('+79673215453')
  owner.displayName = 'Алекс Тестер 7 Мерзляков'

  database.accounts.push(actor, owner)

  const baseGroup = {
    accent: 'earth' as const,
    archiveReason: undefined,
    archivedAt: undefined,
    avatarImage: undefined,
    commentBlacklistIdentifiers: [],
    commentsEnabledForAll: false,
    commentsEnabledForPremium: false,
    creatorIdentifier: owner.identifier,
    description: '',
    groupOwnerIdentifier: owner.identifier,
    latestActivityAt: '2026-04-06T10:00:00.000Z',
    members: 1,
    muted: false,
    ownerIdentifier: owner.identifier,
    participants: [
      {
        accent: 'earth' as const,
        id: 1,
        identifier: owner.identifier,
        nickname: '',
        status: '',
        title: owner.displayName,
      },
    ],
    preview: 'Тестовая группа',
    time: '10:00',
    unread: 0,
  }

  database.groups.push({
    ...baseGroup,
    handle: '@17',
    id: 1,
    sharedId: 'shared-17',
    title: '17',
  })
  database.groups.push({
    ...baseGroup,
    handle: '@21',
    id: 2,
    latestActivityAt: '2026-04-06T11:00:00.000Z',
    sharedId: '755b4b42-0730-44c5-be6b-1a0f35ce5d51',
    time: '11:00',
    title: '21',
  })
  database.groups.push({
    ...baseGroup,
    handle: '@121',
    id: 3,
    latestActivityAt: '2026-04-06T12:00:00.000Z',
    sharedId: 'shared-121',
    time: '12:00',
    title: '121',
  })

  const titleSearch = store.adminListGroups('21')
  assert.equal(titleSearch[0]?.title, '21')
  assert.equal(titleSearch[0]?.sharedId, '755b4b42-0730-44c5-be6b-1a0f35ce5d51')

  const sharedIdSearch = store.adminListGroups('755b4b42-0730-44c5-be6b-1a0f35ce5d51')
  assert.equal(sharedIdSearch[0]?.title, '21')
  assert.equal(sharedIdSearch[0]?.sharedId, '755b4b42-0730-44c5-be6b-1a0f35ce5d51')
})

test('thread admin archive flow is wired through admin ui, route and store contracts', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const routeSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-routes.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const permissionsSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-permissions.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const adminCssSource = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')

  assert.match(adminAppSource, /handleToggleThreadArchive/u)
  assert.match(adminAppSource, /threadListFilter/u)
  assert.match(adminAppSource, /\/icons\/archive\.png/u)
  assert.match(adminAppSource, /\/icons\/omnichannel100\.png/u)
  assert.match(adminAppSource, /Архивированные комментарии/u)
  assert.match(adminAppSource, /Активные комментарии/u)
  assert.match(adminAppSource, /Архивировать комментарии/u)
  assert.match(adminAppSource, /Разархивировать комментарии/u)
  assert.match(adminAppSource, /admin-button-with-icon-archive/u)
  assert.match(adminAppSource, /threads\.archive\.manage/u)
  assert.match(appSource, /threadGroupMessage && !threadGroupMessage\.threadId/u)
  assert.match(appSource, /threadChannelPost && !threadChannelPost\.threadId/u)
  assert.match(adminCssSource, /\.admin-icon-with-text-archive/u)
  assert.match(backendSource, /\/api\/admin\/threads\/archive-toggle/u)
  assert.match(backendSource, /\/api\/admin\/threads\/export/u)
  assert.match(backendSource, /\{ \.\.\.body, threadId \}/u)
  assert.match(routeSource, /\/api\/admin\/threads\/:threadId\/archive-toggle/u)
  assert.match(routeSource, /\/api\/admin\/threads\/archive-toggle/u)
  assert.match(routeSource, /\/api\/admin\/threads\/export/u)
  assert.match(routeSource, /threads\.archive\.manage/u)
  assert.match(routeSource, /broadcastSnapshotsForIdentifiers\(payload\.broadcastIdentifiers\)/u)
  assert.match(storeSource, /adminSetThreadArchived/u)
  assert.match(storeSource, /threadArchivedAt/u)
  assert.match(storeSource, /threadArchiveReason/u)
  assert.match(storeSource, /Обсуждение находится в архиве и недоступно пользователям/u)
  assert.match(permissionsSource, /threads\.archive\.manage/u)
  assert.match(sharedBackendSource, /'threads\.archive\.manage'/u)
})

test('archived threads surface a moderation hint in group and channel message menus', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /getThreadsModerationNoticeText/u)
  assert.match(appSource, /Комментарии заблокированы модерацией\./u)
  assert.match(appSource, /activeSubscriptionPost\.threadArchivedAt/u)
  assert.match(appSource, /activeGroupMessage\.threadArchivedAt/u)
  assert.match(appSource, /reason: 'archived'/u)
})

test('archived group invites stay non-openable and render a user-facing deleted hint', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const cssSource = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')

  assert.match(appSource, /if \(sourceGroup\.archivedAt\) return/u)
  assert.match(bubbleSource, /const deletedHint = sourceGroup\.archivedAt \? 'Группа удалена' : ''/u)
  assert.match(bubbleSource, /bubble-forwarded-source-warning/u)
  assert.match(cssSource, /\.bubble-forwarded-source-warning/u)
  assert.match(storeSource, /materializeSourceGroupForViewer/u)
  assert.match(storeSource, /shouldHideArchivedGroupForUsers\(matchingGroup\)/u)
})

test('channel admin archive flow and subscriber csv export stay wired through admin ui, route and store contracts', async () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const adminAppSource = readFileSync(join(repoRoot, 'src', 'AdminApp.tsx'), 'utf8')
  const backendSource = readFileSync(join(repoRoot, 'src', 'app', 'backend.ts'), 'utf8')
  const routeSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-routes.ts'), 'utf8')
  const storeSource = readFileSync(join(repoRoot, 'server', 'src', 'store.ts'), 'utf8')
  const permissionsSource = readFileSync(join(repoRoot, 'server', 'src', 'admin-permissions.ts'), 'utf8')
  const sharedBackendSource = readFileSync(join(repoRoot, 'src', 'shared', 'backend.ts'), 'utf8')
  const adminCssSource = readFileSync(join(repoRoot, 'src', 'admin.css'), 'utf8')

  assert.match(adminAppSource, /handleToggleChannelArchive/u)
  assert.match(adminAppSource, /handleDownloadChannelSubscribersCsv/u)
  assert.match(adminAppSource, /channelListFilter/u)
  assert.match(adminAppSource, /\/icons\/archive\.png/u)
  assert.match(adminAppSource, /\/icons\/news100\.svg/u)
  assert.match(adminAppSource, /Архивированные каналы/u)
  assert.match(adminAppSource, /Активные каналы/u)
  assert.match(adminAppSource, /Архивировать канал/u)
  assert.match(adminAppSource, /Разархивировать канал/u)
  assert.match(adminAppSource, /Скачать CSV подписчиков канала/u)
  assert.match(adminAppSource, /Подписчиков: \$\{channel\.readers\}/u)
  assert.match(adminAppSource, /<dt>Статус<\/dt>/u)
  assert.match(adminAppSource, /<dt>Приватность<\/dt>/u)
  assert.match(adminAppSource, /admin-button-with-icon-archive/u)
  assert.match(adminAppSource, /channels\.archive\.manage/u)
  assert.match(adminAppSource, /admin-detail-inline-action/u)
  assert.match(adminCssSource, /\.admin-filter-tab\.entity/u)
  assert.match(backendSource, /\/api\/admin\/channels\/\$\{encodeURIComponent\(handle\)\}\/subscribers\/export/u)
  assert.match(backendSource, /\/api\/admin\/channels\/\$\{encodeURIComponent\(handle\)\}\/archive-toggle/u)
  assert.match(routeSource, /\/api\/admin\/channels\/:handle\/subscribers\/export/u)
  assert.match(routeSource, /\/api\/admin\/channels\/:handle\/archive-toggle/u)
  assert.match(routeSource, /channels\.archive\.manage/u)
  assert.match(routeSource, /broadcastSnapshotsForIdentifiers\(payload\.broadcastIdentifiers\)/u)
  assert.match(storeSource, /adminExportChannelSubscribersCsv/u)
  assert.match(storeSource, /admin\.channel\.subscribers-export\.csv/u)
  assert.match(storeSource, /subscribedAt/u)
  assert.match(storeSource, /\['Имя', 'Телефон', 'Юзернейм', 'Дата подписки'\]/u)
  assert.match(storeSource, /adminSetManagedChannelArchived/u)
  assert.match(storeSource, /archiveManagedChannel\(channel, 'admin-archived'/u)
  assert.match(storeSource, /shouldHideArchivedChannelForUsers/u)
  assert.match(storeSource, /channel\.archiveReason === 'admin-archived'/u)
  assert.match(permissionsSource, /channels\.archive\.manage/u)
  assert.match(sharedBackendSource, /'channels\.archive\.manage'/u)

  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990007101', { staffRole: 'owner' })
  actor.displayName = 'Алекс Тестер'
  actor.nickname = 'alex'
  const subscriber = createAccount('+79990007102')
  subscriber.displayName = 'Мира Тестер'
  subscriber.nickname = 'mira'

  database.accounts.push(actor, subscriber)
  const actorToken = createSession(database, actor.identifier, 'channel-subscribers-export-actor')
  const subscriberToken = createSession(database, subscriber.identifier, 'channel-subscribers-export-user')

  const dialog = await store.openDirectDialog(actorToken, { identifier: subscriber.identifier })
  const createdChannel = await store.createManagedChannel(actorToken, {
    avatarTone: '#8c5738',
    directLink: '@channel_subscribers_export',
    statusText: 'Тестовый статус канала',
    title: 'Канал CSV',
    visibility: 'private',
  })
  await store.sendManagedChannelPost(actorToken, createdChannel.channelId, { text: 'Пост для инвайта' })
  await store.inviteManagedChannelMembers(actorToken, createdChannel.channelId, {
    dialogIds: [dialog.dialogId],
  })
  await store.subscribeToChannelByHandle(subscriberToken, '@channel_subscribers_export')

  const response = await store.adminExportChannelSubscribersCsv(
    actorToken,
    '@channel_subscribers_export',
    'Проверка подписчиков канала',
  )
  assert.match(response.fileName, /channel-subscribers-/u)
  assert.match(response.csv, /"Имя","Телефон","Юзернейм","Дата подписки"/u)
  assert.match(response.csv, /Алекс Тестер/u)
  assert.match(response.csv, /\+79990007101/u)
  assert.match(response.csv, /@alex/u)
  assert.match(response.csv, /Мира Тестер/u)
  assert.match(response.csv, /\+79990007102/u)
  assert.match(response.csv, /@mira/u)
  const subscriberRows = response.csv.trim().split('\n').slice(1)
  assert.equal(subscriberRows.length, 2)
  for (const row of subscriberRows) {
    const cells = row.split(',')
    assert.equal(cells.length, 4)
    assert.match(cells[3] ?? '', /^".+?"$/u)
  }
})

test('status history keeps every non-empty status change and exports it as csv for admin', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const actor = createAccount('+79990007001', { staffRole: 'owner' })
  const user = createAccount('+79990007002')

  database.accounts.push(actor, user)
  const actorToken = createSession(database, actor.identifier, 'status-history-actor')
  const userToken = createSession(database, user.identifier, 'status-history-user')

  await store.updateSession(userToken, { status: 'Первый статус' })
  await store.updateSession(userToken, { status: 'Первый статус' })
  await store.updateSession(userToken, { status: 'Второй статус' })
  await store.updateSession(userToken, { status: '' })
  await store.updateSession(userToken, { status: 'Третий статус' })

  const detail = store.adminGetUser(user.identifier)
  assert.equal(detail.user.status, 'Третий статус')
  assert.deepEqual(
    detail.statusHistory.map((entry) => entry.status),
    ['Первый статус', 'Второй статус', 'Третий статус'],
  )
  assert.equal(detail.statusHistory.length, 3)
  assert.equal(detail.statusHistory.every((entry) => Boolean(entry.setAt)), true)

  const csvExport = await store.adminExportUserStatusHistoryCsv(actorToken, user.identifier)
  assert.match(csvExport.fileName, /user-status-history/u)
  assert.match(csvExport.csv, /Когда установлен/u)
  assert.match(csvExport.csv, /Первый статус/u)
  assert.match(csvExport.csv, /Второй статус/u)
  assert.match(csvExport.csv, /Третий статус/u)
})

test('recordSessionAccessByToken refreshes admin last activity for ordinary session usage', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const user = createAccount('+79990007003')

  database.accounts.push(user)
  const userToken = createSession(database, user.identifier, 'last-active-session')
  const before = store.adminGetUser(user.identifier).user.lastActiveAt

  await store.recordSessionAccessByToken(userToken, {
    ip: '203.0.113.30',
    source: 'http-api',
    userAgent: 'TinychokRuntimeRegression/1.0',
  })

  const detail = store.adminGetUser(user.identifier)
  const after = detail.user.lastActiveAt
  assert.notEqual(after, before)
  assert.ok(after)
  assert.ok(before)
  assert.ok(Date.parse(after) > Date.parse(before))
  assert.equal(detail.ipSummary.latestIp, '203.0.113.30')
})

test('media message menus hide the text-only copy action across direct, group, channel and thread rooms', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /!\s*activeSubscriptionPost\.attachment\s*\?\s*\(/u)
  assert.match(appSource, /!\s*activeThreadComment\.attachment\s*\?\s*\(/u)
  assert.match(appSource, /!\s*activeGroupMessage\.attachment\s*\?\s*\(/u)
  assert.match(appSource, /!\s*activeMessage\.attachment\s*\?\s*\(/u)
  assert.match(appSource, /copy action stays text-only and must be hidden for attachments/u)
})

test('opening a writable room focuses the composer immediately', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(directRoomSource, /draftInputRef\.current\?\.focus\(\)/u)
  assert.match(directRoomSource, /\[\s*activeChat\.id,\s*activeChat\.archivedAccount,\s*effectiveComposerDisabledNotice,\s*effectiveComposerGate\s*\]/u)
  assert.match(groupRoomSource, /draftInputRef\.current\?\.focus\(\)/u)
  assert.match(groupRoomSource, /\[\s*composerDisabledNotice,\s*group\.id\s*\]/u)
  assert.match(channelRoomSource, /publisherInputRef\.current\?\.focus\(\)/u)
  assert.match(channelRoomSource, /\[\s*channel\.id,\s*publisher\s*\]/u)
  assert.match(appSource, /supportComposerInputRef\.current\?\.focus\(\)/u)
  assert.match(appSource, /settingsView !== 'support'/u)
})

test('mobile direct-room status adapts to wrapped titles and keeps explicit expand and collapse toggle', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(directRoomSource, /const roomStatusText = activeChat\.status\.trim\(\)/u)
  assert.match(directRoomSource, /roomStatusText\.toLowerCase\(\) !== 'в сети'/u)
  assert.match(directRoomSource, /const roomPresenceText = roomPresenceParts\.join\(' · '\)\.trim\(\) \|\| '\\u00A0'/u)
  assert.match(directRoomSource, /const \[roomStatusExpanded, setRoomStatusExpanded\] = useState\(false\)/u)
  assert.match(directRoomSource, /const \[roomStatusExpandable, setRoomStatusExpandable\] = useState\(false\)/u)
  assert.match(directRoomSource, /const \[roomStatusCollapsedLines, setRoomStatusCollapsedLines\] = useState<1 \| 2>\(2\)/u)
  assert.match(directRoomSource, /window\.matchMedia\('\(max-width: 640px\)'\)\.matches/u)
  assert.match(directRoomSource, /const roomTitleHeadingRef = useRef<HTMLHeadingElement \| null>\(null\)/u)
  assert.match(directRoomSource, /titleHeading\.scrollHeight > titleLineHeight \* 1\.5/u)
  assert.match(directRoomSource, /const nextCollapsedLines: 1 \| 2 = titleUsesMultipleLines \? 1 : 2/u)
  assert.match(directRoomSource, /setRoomStatusCollapsedLines\(\(previous\) => \(previous === nextCollapsedLines \? previous : nextCollapsedLines\)\)/u)
  assert.match(directRoomSource, /className="chat-avatar-stack room-avatar-stack"/u)
  assert.match(directRoomSource, /<h3 ref=\{roomTitleHeadingRef\}>/u)
  assert.match(
    directRoomSource,
    /activeChat\.online && !activeChat\.archivedAccount \? <span className="presence-dot" aria-label="В сети" \/>\s*: null/u,
  )
  assert.match(directRoomSource, /room-presence-block/u)
  assert.match(directRoomSource, /room-presence-text-toggleable/u)
  assert.match(directRoomSource, /room-presence-text-collapsed-\$\{roomStatusCollapsedLines\}/u)
  assert.match(directRoomSource, /room-presence-toggle/u)
  assert.match(directRoomSource, /aria-label=\{roomStatusExpanded \? 'Свернуть статус' : 'Показать полный статус'\}/u)
  assert.match(directRoomSource, /<img src="\/icons\/back\.png" alt="" aria-hidden="true" \/>/u)
  assert.doesNotMatch(directRoomSource, /room-online-label/u)

  assert.match(appCss, /\.room-avatar-stack\s*\{[\s\S]*align-self:\s*center;/u)
  assert.match(appCss, /\.room-presence-text-toggleable\s*\{[\s\S]*padding-right:\s*24px;/u)
  assert.match(appCss, /\.room-presence-text-toggleable\.room-presence-text-collapsed-1\s*\{[\s\S]*-webkit-line-clamp:\s*1;/u)
  assert.match(appCss, /\.room-presence-text-toggleable\.room-presence-text-collapsed-2\s*\{[\s\S]*-webkit-line-clamp:\s*2;/u)
  assert.match(appCss, /\.room-presence-toggle\s*\{[\s\S]*position:\s*absolute;[\s\S]*bottom:\s*0;/u)
  assert.match(appCss, /\.room-presence-toggle img\s*\{[\s\S]*transform:\s*rotate\(-90deg\);/u)
  assert.match(appCss, /\.room-presence-toggle\.is-expanded img\s*\{[\s\S]*transform:\s*rotate\(90deg\);/u)
  assert.match(appCss, /\.room-presence-block-expanded\s+\.room-presence-toggle\s*\{[\s\S]*position:\s*static;/u)
  assert.match(rolloutDoc, /direct room header не должен показывать `В сети`/u)
  assert.match(handoffDoc, /без `В сети` в direct room header/u)
})

test('mobile direct-room header shrinks long names before they can run into the action buttons', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(directRoomSource, /const roomTitleNameRef = useRef<HTMLDivElement \| null>\(null\)/u)
  assert.match(directRoomSource, /if \(!titleBlock \|\| !titleHeading \|\| !activeChat\.title\.trim\(\)\)/u)
  assert.match(directRoomSource, /const isCompactViewport = window\.matchMedia\('\(max-width: 640px\)'\)\.matches/u)
  assert.match(directRoomSource, /const minFontSize = isCompactViewport \? 12\.5 : 15/u)
  assert.match(directRoomSource, /const widthOverflow = titleHeading\.scrollWidth > titleHeading\.clientWidth \+ 1/u)
  assert.match(directRoomSource, /const heightOverflow = titleHeading\.scrollHeight > maxHeight/u)
  assert.match(
    directRoomSource,
    /while \(nextFontSize > minFontSize\) \{[\s\S]*if \(!widthOverflow && !heightOverflow\) \{[\s\S]*break/u,
  )
  assert.match(directRoomSource, /resizeObserver\.observe\(titleBlock\)/u)
  assert.match(directRoomSource, /<div ref=\{roomTitleNameRef\} className="room-title-name">/u)

  assert.match(appCss, /\.room-id > div\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-width:\s*0;/u)
  assert.match(
    appCss,
    /\.room-title-name h3\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*max-width:\s*100%;[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/u,
  )
  assert.match(appCss, /@media \(max-width: 420px\) \{[\s\S]*\.room-title-name\s*\{[\s\S]*align-items:\s*flex-start;/u)
})

test('video-note recorder close button keeps the cancel icon centered and the title can switch to the mobile square contract', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const recorderSource = readFileSync(join(repoRoot, 'src', 'components', 'VideoNoteRecorderOverlay.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(recorderSource, /const isMobileRecorderSurface = isMobileBrowserEnvironment\(\)/u)
  assert.match(recorderSource, /const recorderTitle = isMobileRecorderSurface \? 'Видео-квадратик' : 'Видео-кружочек'/u)
  assert.match(recorderSource, /aria-label=\{recorderTitle\}/u)
  assert.match(recorderSource, /<h3>\{recorderTitle\}<\/h3>/u)
  assert.match(recorderSource, /aria-label=\{`Закрыть \$\{recorderTitle\.toLowerCase\(\)\}`\}/u)
  assert.doesNotMatch(recorderSource, /<span className="settings-label">/u)
  assert.doesNotMatch(recorderSource, /Запишите кружочек до 30 секунд/u)
  assert.match(recorderSource, /className="soft-button video-note-recorder-close"/u)
  assert.match(recorderSource, /<img src="\/icons\/cancel\.png" alt="" aria-hidden="true" \/>/u)
  assert.match(
    appCss,
    /\.video-note-recorder-close\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;[\s\S]*padding:\s*0;/u,
  )
  assert.match(
    appCss,
    /\.video-note-recorder-close img\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;[\s\S]*display:\s*block;[\s\S]*object-fit:\s*contain;/u,
  )
})

test('video-note recorder review preview stays control-free inside the square preview shell', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const recorderSource = readFileSync(join(repoRoot, 'src', 'components', 'VideoNoteRecorderOverlay.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    recorderSource,
    /showingRecordedPreview \? \([\s\S]*<video[\s\S]*src=\{previewUrl\}[\s\S]*className="video-note-recorder-preview"[\s\S]*playsInline[\s\S]*preload="metadata"[\s\S]*\/>/u,
  )
  assert.doesNotMatch(
    recorderSource,
    /showingRecordedPreview \? \([\s\S]*<video[\s\S]*controls[\s\S]*className="video-note-recorder-preview"/u,
  )
  assert.match(
    recorderSource,
    /const showingRecordedPreview = Boolean\(previewUrl\) && \(state === 'review' \|\| state === 'error'\)/u,
  )
  assert.match(recorderSource, /className="video-note-recorder-preview-meta"/u)
  assert.doesNotMatch(recorderSource, /className="video-note-recorder-preview-overlay"/u)
  assert.match(
    appCss,
    /\.video-note-recorder-preview-shell\s*\{[\s\S]*width:\s*min\(300px,\s*70vw\);[\s\S]*aspect-ratio:\s*1;[\s\S]*border-radius:\s*34px;/u,
  )
  assert.match(
    appCss,
    /\.video-note-recorder-preview-meta\s*\{[\s\S]*width:\s*min\(300px,\s*70vw\);[\s\S]*margin:\s*-2px auto 0;/u,
  )
})

test('video-note composer uses round.svg as the empty-state primary action and swaps to the send arrow on payload', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const roomComposerSource = readFileSync(join(repoRoot, 'src', 'components', 'RoomComposer.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(roomComposerSource, /src="\/icons\/round\.svg"/u)
  assert.match(
    roomComposerSource,
    /hasComposerPayload \? \([\s\S]*src="\/icons\/sent\.png"[\s\S]*\) : canOpenVideoNoteRecorder \? \([\s\S]*className="send-button composer-send composer-send-video-note"[\s\S]*src="\/icons\/round\.svg"/u,
  )
  assert.doesNotMatch(roomComposerSource, /className="soft-button composer-tool composer-video-note-button"/u)
  assert.match(appCss, /\.composer-send-video-note \.composer-send-icon img\s*\{[\s\S]*width:\s*24px;[\s\S]*height:\s*24px;/u)
  assert.match(
    appCss,
    /\.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\) \.composer-send\s*\{[\s\S]*width:\s*42px;[\s\S]*min-width:\s*42px;[\s\S]*height:\s*42px;[\s\S]*border-radius:\s*14px;[\s\S]*margin-bottom:\s*0;/u,
  )
  assert.match(
    appCss,
    /\.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\) \.composer-send-icon img\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/u,
  )
  assert.match(
    appCss,
    /\.composer-field:not\(\.composer-field-expanded\):not\(\.composer-field-has-attachment\) \.composer-send-video-note \.composer-send-icon img\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.composer-send\s*\{[\s\S]*background:\s*rgba\(239,\s*240,\s*243,\s*0\.96\);[\s\S]*color:\s*#23262d;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.composer-send \.composer-send-icon img\s*\{[\s\S]*filter:\s*brightness\(0\) saturate\(100%\) invert\(15%\)/u,
  )
})

test('video-note messages render as standalone circles without a rectangular media bubble backdrop', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(
    bubbleSource,
    /className=\{`bubble-attachment-video-note-shell\$\{[\s\S]*isVideoNotePlaying \? ' is-inline-playing' : ''[\s\S]*\}`\}/u,
  )
  assert.match(
    bubbleSource,
    /className="bubble-attachment-video-note-meta"/u,
  )
  assert.match(
    appCss,
    /\.bubble\.video-note-only-bubble,\s*\.bubble-overlay\.bubble-button\.selected\.video-note-only-bubble,\s*\.channel-post\.video-note-only-bubble,\s*\.channel-post\.video-note-only-bubble\.selected\s*\{[\s\S]*background:\s*transparent;[\s\S]*overflow:\s*visible;/u,
  )
  assert.match(
    appCss,
    /\.bubble\.media-only-bubble:has\(\.bubble-attachment-photo-video-note\),[\s\S]*\.channel-post\.media-only-bubble\.selected:has\(\.bubble-attachment-photo-video-note\)\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*outline:\s*none;[\s\S]*border-radius:\s*0;[\s\S]*overflow:\s*visible;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-photo-video-note\s*\{[\s\S]*border-radius:\s*999px;[\s\S]*box-shadow:\s*0 0 0 1px rgba\(255,\s*255,\s*255,\s*0\.08\);/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-meta > \.bubble-attachment-image-overlay\s*\{[\s\S]*position:\s*static;[\s\S]*right:\s*auto;[\s\S]*bottom:\s*auto;/u,
  )
})

test('mobile video-note contract keeps bubble and recorder preview square-ish on touch browsers', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(
    appCss,
    /@media \(max-width: 960px\) and \(pointer: coarse\) \{[\s\S]*\.bubble-attachment-photo-video-note\s*\{[\s\S]*border-radius:\s*30px;[\s\S]*\.bubble-attachment-video-note-progress\s*\{[\s\S]*border-radius:\s*34px;[\s\S]*\.bubble-attachment-video-note-upload-progress\s*\{[\s\S]*border-radius:\s*35px;[\s\S]*\.bubble\.video-note-only-bubble:has\(\.bubble-attachment-photo-video-note\.is-inline-playing\),[\s\S]*\.channel-post\.media-only-bubble\.selected:has\(\.bubble-attachment-photo-video-note\.is-inline-playing\)\s*\{[\s\S]*width:\s*min\(440px,\s*calc\(100vw - 28px\)\);[\s\S]*max-width:\s*min\(440px,\s*calc\(100vw - 28px\)\);[\s\S]*\.bubble-attachment-video-note-shell\.is-inline-playing\s*\{[\s\S]*width:\s*min\(440px,\s*calc\(100vw - 28px\)\);[\s\S]*max-width:\s*min\(440px,\s*calc\(100vw - 28px\)\);[\s\S]*\.video-note-recorder-preview-shell\s*\{[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 72px\)\);[\s\S]*\.video-note-recorder-preview-meta\s*\{[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 72px\)\);/u,
  )
  assert.match(handoffDoc, /mobile browser: `Видео-квадратик`/u)
  assert.match(handoffDoc, /mobile browser intentionally keeps video-note surfaces square-ish:/u)
  assert.match(handoffDoc, /при inline playback mobile квадратик всё равно обязан расширяться заметно больше базового preview/u)
})

test('pending video-note uploads keep a circular ring plus a linear progress bar under the shell', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')
  const directRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'DirectChatRoom.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const overlaySource = readFileSync(join(repoRoot, 'src', 'components', 'SelectedBubbleOverlay.tsx'), 'utf8')

  assert.match(bubbleSource, /const showVideoNoteUploadProgress = isVideoNote && showAttachmentUploadProgress/u)
  assert.match(
    bubbleSource,
    /const showLinearAttachmentUploadProgress = showAttachmentUploadProgress && !isVideoNote/u,
  )
  assert.match(
    bubbleSource,
    /showVideoNoteUploadProgress \? \([\s\S]*className="bubble-attachment-video-note-upload-progress"[\s\S]*'--video-note-upload-progress': `\$\{uploadProgressValue \?\? 0\}`/u,
  )
  assert.match(
    bubbleSource,
    /className="bubble-attachment-video-note-footer"[\s\S]*className="bubble-attachment-video-note-upload-status"[\s\S]*src="\/icons\/hourglass-48\.png"[\s\S]*<span>Отправка<\/span>[\s\S]*className="bubble-attachment-video-note-meta"/u,
  )
  assert.match(
    bubbleSource,
    /className="bubble-attachment-video-note-upload-stack"[\s\S]*className="bubble-attachment-upload-progress bubble-attachment-video-note-upload-bar"[\s\S]*aria-label=\{attachmentUploadCopy\}[\s\S]*style=\{\{ width: `\$\{uploadProgressPercent \?\? 0\}%` \}\}/u,
  )
  assert.match(
    bubbleSource,
    /showLinearAttachmentUploadProgress \? \([\s\S]*className="bubble-attachment-upload-progress bubble-attachment-upload-progress-overlay"/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-upload-progress\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*-5px;[\s\S]*z-index:\s*0;[\s\S]*conic-gradient\([\s\S]*--video-note-upload-progress[\s\S]*-webkit-mask:\s*radial-gradient/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-photo-video-note\s*\{[\s\S]*position:\s*relative;[\s\S]*overflow:\s*visible;[\s\S]*isolation:\s*isolate;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-photo-video-note \.bubble-attachment-image\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-footer\s*\{[\s\S]*justify-content:\s*space-between;[\s\S]*width:\s*100%;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-upload-stack\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*6px;[\s\S]*width:\s*100%;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-upload-status\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*white-space:\s*nowrap;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-upload-bar\s*\{[\s\S]*justify-self:\s*stretch;[\s\S]*width:\s*100%;[\s\S]*height:\s*8px;/u,
  )
  assert.match(
    appCss,
    /\.bubble\.video-note-only-bubble\.has-delivery-issue,[\s\S]*\.channel-post\.video-note-only-bubble\.selected\.delivery-failed\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*outline:\s*none;/u,
  )
  assert.match(
    appCss,
    /html\[data-theme='dark'\] \.bubble\.video-note-only-bubble\.has-delivery-issue,[\s\S]*html\[data-theme='dark'\] \.channel-post\.video-note-only-bubble\.selected\.delivery-failed\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*outline:\s*none;/u,
  )
  assert.match(
    directRoomSource,
    /const isVideoNoteOnlyBubble =[\s\S]*const videoNoteDeliveryIndicatorSrc =[\s\S]*messagePending && isVideoNoteOnlyBubble[\s\S]*bubbleClassNames\.push\('video-note-only-bubble'\)/u,
  )
  assert.match(
    groupRoomSource,
    /const isVideoNoteOnlyBubble =[\s\S]*const videoNoteDeliveryIndicatorSrc =[\s\S]*messagePending && isVideoNoteOnlyBubble[\s\S]*bubbleClassNames\.push\('video-note-only-bubble'\)/u,
  )
  assert.match(
    overlaySource,
    /const isVideoNoteOnlyBubble =[\s\S]*const overlayDeliveryIndicatorSrc =[\s\S]*props\.deliveryIssue === 'pending' && isVideoNoteOnlyBubble[\s\S]*bubbleClassNames\.push\('video-note-only-bubble'\)/u,
  )
})

test('video-note bubbles play inline inside the circle instead of opening the global media viewer overlay', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(bubbleSource, /const \[isVideoNotePlaying, setIsVideoNotePlaying\] = useState\(false\)/u)
  assert.match(bubbleSource, /const \[videoNotePlaybackProgress, setVideoNotePlaybackProgress\] = useState\(0\)/u)
  assert.match(
    bubbleSource,
    /onClick=\{\(event: ReactMouseEvent<HTMLDivElement>\) => \{[\s\S]*if \(isVideoNote\) \{[\s\S]*setIsVideoNotePlaying\(\(current\) => !current\)[\s\S]*return[\s\S]*\}[\s\S]*onOpenAttachment\?\.\(message\.attachment!\)/u,
  )
  assert.match(
    bubbleSource,
    /<VideoAttachmentPreview[\s\S]*isInlinePlaying=\{isVideoNotePlaying\}[\s\S]*onInlinePlaybackProgressChange=\{setVideoNotePlaybackProgress\}[\s\S]*onInlinePlaybackStateChange=\{setIsVideoNotePlaying\}/u,
  )
  assert.match(
    bubbleSource,
    /bubble-attachment-photo-video-note' : ''\}\$\{[\s\S]*isVideoNote && isVideoNotePlaying \? ' is-inline-playing' : ''/u,
  )
  assert.match(
    bubbleSource,
    /isVideoNote && isVideoNotePlaying \? \([\s\S]*className="bubble-attachment-video-note-progress"[\s\S]*'--video-note-playback-progress': `\$\{videoNotePlaybackProgress\}`/u,
  )
  assert.match(
    bubbleSource,
    /function normalizeInlinePlaybackProgress\(currentTime: number, duration: number\) \{[\s\S]*return Math\.min\(1, Math\.max\(0, currentTime \/ duration\)\)/u,
  )
  assert.match(
    bubbleSource,
    /if \(isVideoNote && isInlinePlaying\) \{[\s\S]*<video[\s\S]*ref=\{inlineVideoRef\}[\s\S]*src=\{mediaUrl\}[\s\S]*playsInline[\s\S]*preload="metadata"/u,
  )
  assert.match(
    bubbleSource,
    /onLoadedMetadata=\{\(event\) => \{[\s\S]*onInlinePlaybackProgressChange\?\.\([\s\S]*normalizeInlinePlaybackProgress\(event\.currentTarget\.currentTime,\s*event\.currentTarget\.duration\)/u,
  )
  assert.match(
    bubbleSource,
    /onTimeUpdate=\{\(event\) => \{[\s\S]*onInlinePlaybackProgressChange\?\.\([\s\S]*normalizeInlinePlaybackProgress\(event\.currentTarget\.currentTime,\s*event\.currentTarget\.duration\)/u,
  )
  assert.match(
    bubbleSource,
    /onEnded=\{\(event\) => \{[\s\S]*event\.currentTarget\.currentTime = 0[\s\S]*onInlinePlaybackProgressChange\?\.\(0\)[\s\S]*onInlinePlaybackStateChange\?\.\(false\)/u,
  )
  assert.match(
    bubbleSource,
    /onError=\{\(\) => \{[\s\S]*setPreviewFailed\(true\)[\s\S]*onInlinePlaybackProgressChange\?\.\(0\)[\s\S]*onInlinePlaybackStateChange\?\.\(false\)/u,
  )
  assert.match(bubbleSource, /isVideoNote && isVideoNotePlaying \? null : \(/u)
  assert.match(
    appCss,
    /\.bubble\.media-only-bubble:has\(\.bubble-attachment-photo-video-note\.is-inline-playing\),[\s\S]*\.channel-post\.media-only-bubble\.selected:has\(\.bubble-attachment-photo-video-note\.is-inline-playing\)\s*\{[\s\S]*width:\s*min\(440px,\s*100%\);[\s\S]*max-width:\s*min\(440px,\s*100%\);/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-shell\.is-inline-playing\s*\{[\s\S]*width:\s*min\(440px,\s*100%\);[\s\S]*max-width:\s*min\(440px,\s*calc\(100vw - 72px\),\s*100%\);[\s\S]*justify-items:\s*stretch;/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-progress\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*-4px;[\s\S]*border-radius:\s*999px;[\s\S]*conic-gradient\([\s\S]*--video-note-playback-progress[\s\S]*-webkit-mask:\s*radial-gradient/u,
  )
})

test('video-note inline playback keeps the expanded circle visible inside the room feed viewport', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const roomFeedScrollSource = readFileSync(
    join(repoRoot, 'src', 'app', 'roomFeedAutoScroll.ts'),
    'utf8',
  )

  assert.match(
    bubbleSource,
    /import \{ keepRoomFeedChildVisible \} from '\.\.\/app\/roomFeedAutoScroll'/u,
  )
  assert.match(
    bubbleSource,
    /const videoNoteShell = videoNoteShellRef\.current[\s\S]*closest<HTMLElement>\('\.message-feed'\)/u,
  )
  assert.match(bubbleSource, /const resizeObserver = new ResizeObserver/u)
  assert.match(
    bubbleSource,
    /keepRoomFeedChildVisible\(\{[\s\S]*paddingBottom:\s*18,[\s\S]*paddingTop:\s*12,[\s\S]*target:\s*videoNoteShell/u,
  )
  assert.match(
    roomFeedScrollSource,
    /export function keepRoomFeedChildVisible\(options:\s*\{[\s\S]*target:\s*HTMLElement/u,
  )
  assert.match(roomFeedScrollSource, /if \(targetRect\.height > visibleHeight\)/u)
  assert.match(roomFeedScrollSource, /else if \(targetRect\.bottom > visibleBottom\)/u)
  assert.match(roomFeedScrollSource, /feed\.scrollTop = nextScrollTop/u)
})

test('video-note inline playback shows loading percent while a remote clip is buffering', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(bubbleSource, /const \[isVideoNoteLoading, setIsVideoNoteLoading\] = useState\(false\)/u)
  assert.match(bubbleSource, /const \[videoNoteLoadProgress, setVideoNoteLoadProgress\] = useState\(0\)/u)
  assert.match(
    bubbleSource,
    /function normalizeInlinePlaybackLoadProgress\(video: HTMLVideoElement\) \{[\s\S]*video\.buffered\.length === 0[\s\S]*video\.buffered\.end\(video\.buffered\.length - 1\) \/ video\.duration/u,
  )
  assert.match(
    bubbleSource,
    /<VideoAttachmentPreview[\s\S]*onInlinePlaybackLoadProgressChange=\{setVideoNoteLoadProgress\}[\s\S]*onInlinePlaybackLoadingStateChange=\{setIsVideoNoteLoading\}/u,
  )
  assert.match(
    bubbleSource,
    /const showVideoNoteLoadProgress = isVideoNote && isVideoNotePlaying && isVideoNoteLoading/u,
  )
  assert.match(
    bubbleSource,
    /showVideoNoteLoadProgress \? \([\s\S]*className="bubble-attachment-video-note-loading-overlay"[\s\S]*Загрузка[\s\S]*videoNoteLoadPercent/u,
  )
  assert.match(
    bubbleSource,
    /onLoadStart=\{\(\) => \{[\s\S]*onInlinePlaybackLoadProgressChange\?\.\(0\)[\s\S]*onInlinePlaybackLoadingStateChange\?\.\(true\)/u,
  )
  assert.match(
    bubbleSource,
    /onProgress=\{\(event\) => \{[\s\S]*onInlinePlaybackLoadProgressChange\?\.\([\s\S]*normalizeInlinePlaybackLoadProgress\(event\.currentTarget\)/u,
  )
  assert.match(
    bubbleSource,
    /onPlaying=\{\(\) => \{[\s\S]*onInlinePlaybackLoadProgressChange\?\.\(1\)[\s\S]*onInlinePlaybackLoadingStateChange\?\.\(false\)/u,
  )
  assert.match(
    appCss,
    /\.bubble-attachment-video-note-loading-overlay\s*\{[\s\S]*position:\s*absolute;[\s\S]*right:\s*10px;[\s\S]*bottom:\s*10px;[\s\S]*backdrop-filter:\s*blur\(10px\)/u,
  )
  assert.match(appCss, /\.bubble-attachment-video-note-loading-value\s*\{[\s\S]*font-weight:\s*600;/u)
})

test('video-note recorder auto-sends after stop and keeps retry on the same clip after an error', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const recorderSource = readFileSync(join(repoRoot, 'src', 'components', 'VideoNoteRecorderOverlay.tsx'), 'utf8')

  assert.match(recorderSource, /state === 'recording'[\s\S]*\?\s*'Отправить'/u)
  assert.doesNotMatch(recorderSource, /state === 'recording'[\s\S]*\?\s*'Остановить запись'/u)
  assert.match(
    recorderSource,
    /recorder\.onstop = \(\) => \{[\s\S]*reviewBlobRef\.current = nextBlob[\s\S]*setPreviewUrl\(URL\.createObjectURL\(nextBlob\)\)[\s\S]*setState\('review'\)[\s\S]*void handleUse\(\)/u,
  )
  assert.match(recorderSource, /state === 'error' && recordedClipAvailable[\s\S]*'Отправить снова'/u)
  assert.match(
    recorderSource,
    /if \(state === 'review' \|\| \(state === 'error' && reviewBlobRef\.current\)\) \{[\s\S]*void handleUse\(\)/u,
  )
})

test('video-note recorder still routes immediate sends through the shared room send pipeline instead of composer draft parking', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /async function prepareVideoNoteDraftForImmediateSend\(file: File\)/u)
  assert.match(appSource, /createComposerDraft\(file,\s*\{[\s\S]*presentation:\s*'video-note'/u)
  assert.match(appSource, /void sendMessage\(nextAttachmentDraft\)/u)
  assert.match(appSource, /void sendGroupMessage\(nextAttachmentDraft\)/u)
  assert.match(appSource, /void sendManagedChannelPost\(nextAttachmentDraft\)/u)
  assert.match(appSource, /void submitThreadComment\(nextAttachmentDraft\)/u)
  assert.doesNotMatch(appSource, /attachVideoNoteToChat/u)
  assert.doesNotMatch(appSource, /attachVideoNoteToGroup/u)
  assert.doesNotMatch(appSource, /attachVideoNoteToChannel/u)
  assert.doesNotMatch(appSource, /attachVideoNoteToThread/u)
})

test('owned groups and channels show the edit badge in the left rail and room headers', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const groupRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'GroupRoom.tsx'), 'utf8')
  const channelRoomSource = readFileSync(join(repoRoot, 'src', 'rooms', 'SubscriptionChannelRoom.tsx'), 'utf8')
  const appCss = readFileSync(join(repoRoot, 'src', 'App.css'), 'utf8')

  assert.match(appSource, /function isOwnedGroupPreview/u)
  assert.match(appSource, /function isOwnedSubscriptionChannelPreview/u)
  assert.match(appSource, /isOwnedGroupPreview\(group\)[\s\S]*chat-owner-edit-badge/u)
  assert.match(appSource, /isOwnedSubscriptionChannelPreview\(channel\)[\s\S]*chat-owner-edit-badge/u)
  assert.match(appSource, /showOwnerEditIcon=\{isOwnedGroupPreview\(activeGroup\)\}/u)
  assert.match(appSource, /showOwnerEditIcon=\{isCurrentSubscriptionChannelOwner\}/u)
  assert.match(appSource, /<img src="\/icons\/news100\.svg" alt="Канал" \/>[\s\S]*isOwnedSubscriptionChannelPreview\(channel\)[\s\S]*chat-owner-edit-badge/u)
  assert.match(appSource, /<img src="\/icons\/group100\.png" alt="Группа" \/>[\s\S]*isOwnedGroupPreview\(group\)[\s\S]*chat-owner-edit-badge/u)
  assert.match(groupRoomSource, /showOwnerEditIcon\?: boolean/u)
  assert.match(groupRoomSource, /room-owner-edit-badge/u)
  assert.match(groupRoomSource, /<img src="\/icons\/group100\.png" alt="Группа" \/>[\s\S]*showOwnerEditIcon[\s\S]*room-owner-edit-badge/u)
  assert.match(channelRoomSource, /showOwnerEditIcon\?: boolean/u)
  assert.match(channelRoomSource, /room-owner-edit-badge/u)
  assert.match(channelRoomSource, /<img src="\/icons\/news100\.svg" alt="Канал" \/>[\s\S]*showOwnerEditIcon[\s\S]*room-owner-edit-badge/u)
  assert.match(appCss, /\.chat-owner-edit-badge/u)
  assert.match(appCss, /\.room-owner-edit-badge/u)
  assert.match(appSource, /\/icons\/edit100\.png/u)
})

test('owner room menus show edit icon before group and channel settings actions', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(
    appSource,
    /className="message-menu-item message-menu-item-with-icon"[\s\S]*<img src="\/icons\/edit100\.png" alt="" aria-hidden="true" \/>[\s\S]*<span>Настройки канала<\/span>/u,
  )
  assert.match(
    appSource,
    /className="message-menu-item message-menu-item-with-icon"[\s\S]*<img src="\/icons\/edit100\.png" alt="" aria-hidden="true" \/>[\s\S]*<span>Настройки группы<\/span>/u,
  )
})

test('switching rooms from the left rail clears any stale thread target before opening the new entity', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')

  assert.match(appSource, /Switching rooms from the left rail must always drop the previously open thread/u)
  assert.match(appSource, /function openSubscriptionChannel\(channelId: number\) \{[\s\S]*resetThreadState\(\)[\s\S]*setStageView\('main'\)/u)
  assert.match(appSource, /function showPreviewSubscriptionChannel\(channel: SubscriptionChannel\) \{[\s\S]*resetThreadState\(\)[\s\S]*setStageView\('main'\)/u)
  assert.match(appSource, /function openGroup\(groupId: number\) \{[\s\S]*resetThreadState\(\)[\s\S]*setStageView\('main'\)/u)
  assert.match(appSource, /function openChat\(chatId: number, options\?: \{ bottomSection\?: 'chats' \| 'contacts' \}\) \{[\s\S]*resetThreadState\(\)[\s\S]*setStageView\('main'\)/u)
})

test('reply previews render only the quoted text and no longer inject ambiguous author labels', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const bubbleSource = readFileSync(join(repoRoot, 'src', 'components', 'BubbleMessageContent.tsx'), 'utf8')

  assert.match(
    bubbleSource,
    /showReplyInline && message\.replyTo[\s\S]*<div className="bubble-reply">[\s\S]*<p>\{stripMessageFormattingMarkup\(message\.replyTo\.text\)\}<\/p>/u,
  )
  assert.doesNotMatch(
    bubbleSource,
    /showReplyInline && message\.replyTo[\s\S]*formatMessageAuthor\(message\.replyTo\.author/u,
  )
  assert.doesNotMatch(
    bubbleSource,
    /showReplyInline && message\.replyTo[\s\S]*message\.replyTo\.author === 'me'[\s\S]*'Вы'/u,
  )
  assert.doesNotMatch(
    bubbleSource,
    /showReplyInline && message\.replyTo[\s\S]*'Собеседник'/u,
  )
  assert.match(
    bubbleSource,
    /ReplyReferenceBlock[\s\S]*className =[\s\S]*bubble-reply-reference-copy/u,
  )
  assert.doesNotMatch(bubbleSource, /bubble-reply-reference-label/u)
})

test('GIF picker keeps the tab/search open for free accounts and leaves premium only on library upload', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const pickerSource = readFileSync(join(repoRoot, 'src', 'components', 'EmojiPicker.tsx'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const releaseDoc = readFileSync(join(repoRoot, 'docs', 'release-contracts.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')

  const handleGifTabOpenStart = pickerSource.indexOf('function handleGifTabOpen()')
  const gifNoticeEffectStart = pickerSource.indexOf('useEffect(() => {\n    if (!gifNotice) return')
  assert.ok(handleGifTabOpenStart >= 0 && gifNoticeEffectStart > handleGifTabOpenStart)
  const handleGifTabOpenBlock = pickerSource.slice(handleGifTabOpenStart, gifNoticeEffectStart)

  assert.match(
    handleGifTabOpenBlock,
    /function handleGifTabOpen\(\) \{[\s\S]*setActiveTab\('gifs'\)[\s\S]*setGifError\(''\)[\s\S]*setGifNotice\(''\)/u,
  )
  assert.doesNotMatch(
    handleGifTabOpenBlock,
    /onOpenPremiumUpsell\?\.\(\)[\s\S]*return/u,
  )
  assert.match(pickerSource, /aria-label="GIFs"/u)
  assert.match(pickerSource, /title="GIFs"/u)
  assert.doesNotMatch(pickerSource, /GIFs доступны в премиуме/u)
  assert.match(
    pickerSource,
    /if \(!query \|\| !onSearchGifs\) \{[\s\S]*setGifSearchBusy\(false\)[\s\S]*setGifSearchResults\(\[\]\)/u,
  )
  assert.match(
    pickerSource,
    /function openGifFileDialog\(\) \{[\s\S]*if \(!premiumUnlocked\) \{[\s\S]*onOpenPremiumUpsell\?\.\(\)[\s\S]*return/u,
  )
  assert.match(pickerSource, /Загрузка своих GIF доступна в премиуме/u)

  const addGifToLibraryStart = appSource.indexOf('async function addGifAttachmentToLibrary')
  const attachChatGifStart = appSource.indexOf('function attachChatGif')
  assert.ok(addGifToLibraryStart >= 0 && attachChatGifStart > addGifToLibraryStart)
  const addGifToLibraryBlock = appSource.slice(addGifToLibraryStart, attachChatGifStart)
  assert.doesNotMatch(addGifToLibraryBlock, /openPremiumUpsell\(\)/u)
  assert.doesNotMatch(addGifToLibraryBlock, /GIF доступны только в премиуме/u)

  assert.match(releaseDoc, /вход во вкладку, поиск и отправка GIF не требуют premium/u)
  assert.match(handoffDoc, /GIF-вкладка открыта всем, поиск и отправка GIF не требуют premium/u)
  assert.match(rolloutDoc, /GIF picker больше не блокирует сам вход во вкладку для бесплатного аккаунта/u)
})

test('free accounts can search and reuse existing GIFs but still cannot upload their own GIF files into the library', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const viewer = createAccount('+79990007201')
  const source = createAccount('+79990007202', {
    premium: true,
    premiumExpiresAt: daysFromNow(30),
  })
  source.gifLibrary = [
    {
      createdAt: '2026-04-11T18:00:00.000Z',
      fileName: 'pikachu-party.gif',
      id: 'gif-source-1',
      mediaUrl: 'https://cdn.example.com/user-gifs/pikachu-party.gif',
      mimeType: 'image/gif',
      size: 1024,
      width: 320,
      height: 180,
    },
  ]
  database.accounts.push(viewer, source)
  database.sharedGifs = source.gifLibrary.map((gif) => ({
    ...gif,
    uploadedByIdentifier: source.identifier,
  }))

  const viewerToken = createSession(database, viewer.identifier, 'gif-free-viewer')

  const searchResult = store.searchUserGifs(viewerToken, 'pikachu')
  assert.equal(searchResult.items.length, 1)
  assert.equal(searchResult.items[0]?.mediaUrl, 'https://cdn.example.com/user-gifs/pikachu-party.gif')

  seedAcceptedContactLink(database, viewer.identifier, source.identifier)
  const dialogResponse = await store.openDirectDialog(viewerToken, { identifier: source.identifier })
  const groupResponse = await store.createGroup(viewerToken, {
    commentsEnabledForAll: true,
    memberDialogIds: [dialogResponse.dialogId],
    title: 'GIF Search Reuse',
  })

  await assert.doesNotReject(() =>
    store.sendDirectMessage(viewerToken, dialogResponse.dialogId, {
      attachment: {
        ...searchResult.items[0]!,
      },
      text: '',
    }),
  )

  await assert.doesNotReject(() =>
    store.sendGroupMessage(viewerToken, groupResponse.groupId, {
      attachment: {
        ...searchResult.items[0]!,
      },
      text: '',
    }),
  )

  assert.equal(store.getSnapshotByToken(viewerToken)?.session.gifLibrary?.length ?? 0, 0)

  const reusedGifResult = await store.addUserGif(viewerToken, {
    createdAt: '2026-04-11T18:05:00.000Z',
    fileName: 'pikachu-party.gif',
    id: 'gif-viewer-copy-1',
    mediaUrl: 'https://cdn.example.com/user-gifs/pikachu-party.gif',
    mimeType: 'image/gif',
    size: 1024,
    source: 'viewer',
    width: 320,
    height: 180,
  })
  assert.equal(reusedGifResult.snapshot.session.gifLibrary?.length ?? 0, 1)
  assert.equal(reusedGifResult.snapshot.session.gifLibrary?.[0]?.mediaUrl, 'https://cdn.example.com/user-gifs/pikachu-party.gif')

  await assert.rejects(
    store.addUserGif(viewerToken, {
      createdAt: '2026-04-11T18:05:30.000Z',
      fileName: 'unknown.gif',
      id: 'gif-viewer-copy-unknown',
      mediaUrl: 'https://cdn.example.com/user-gifs/unknown.gif',
      mimeType: 'image/gif',
      size: 512,
      source: 'viewer',
      width: 120,
      height: 120,
    }),
    /GIF не найдена в библиотеке Тайничка\./u,
  )

  await store.registerPendingMediaUpload(viewerToken, {
    fileName: 'my-own-upload.gif',
    kind: 'user-gif',
    mediaUrl: 'https://cdn.example.com/user-gifs/my-own-upload.gif',
    mimeType: 'image/gif',
    size: 2048,
    storageKey: 'user-gifs/my-own-upload.gif',
  })

  await assert.rejects(
    store.addUserGif(viewerToken, {
      createdAt: '2026-04-11T18:06:00.000Z',
      fileName: 'my-own-upload.gif',
      id: 'gif-upload-copy-1',
      mediaUrl: 'https://cdn.example.com/user-gifs/my-own-upload.gif',
      mimeType: 'image/gif',
      size: 2048,
      source: 'upload',
      width: 240,
      height: 240,
    }),
    /Загрузка своих GIF доступна только в премиуме\./u,
  )
})

test('premium gif uploads stop at 100 items per month and keep the shared pool searchable', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const uploader = createAccount('+79990007231', {
    premium: true,
    premiumExpiresAt: '2099-05-01T00:00:00.000Z',
  })
  uploader.gifUploadHistory = Array.from({ length: 100 }, (_, index) => {
    return `2026-04-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`
  })
  database.accounts.push(uploader)

  const uploaderToken = createSession(database, uploader.identifier, 'gif-limit-owner')
  const uploadUrl = 'https://cdn.example.com/user-gifs/limit-hit.gif'
  await store.registerPendingMediaUpload(uploaderToken, {
    fileName: 'limit-hit.gif',
    kind: 'user-gif',
    mediaUrl: uploadUrl,
    mimeType: 'image/gif',
    size: 2048,
    storageKey: 'user-gifs/limit-hit.gif',
  })

  await assert.rejects(
    store.addUserGif(uploaderToken, {
      createdAt: '2026-04-30T18:06:00.000Z',
      fileName: 'limit-hit.gif',
      id: 'gif-limit-hit',
      mediaUrl: uploadUrl,
      mimeType: 'image/gif',
      size: 2048,
      source: 'upload',
      width: 240,
      height: 240,
    }),
    /Подождите конца месяца, вы пытаетесь загрузить слишком много GIF-анимаций\./u,
  )

  assert.equal(
    getStoreDatabase(store).pendingMediaUploads.some((upload) => upload.mediaUrl === uploadUrl),
    false,
  )

  uploader.gifUploadHistory = []
  const seededSharedGif = {
    createdAt: '2026-04-11T18:00:00.000Z',
    fileName: 'shared-pikachu.gif',
    id: 'shared-pikachu',
    mediaUrl: 'https://cdn.example.com/user-gifs/shared-pikachu.gif',
    mimeType: 'image/gif' as const,
    size: 1024,
    width: 320,
    height: 180,
    uploadedByIdentifier: uploader.identifier,
  }
  database.sharedGifs = [seededSharedGif]

  const addResult = await store.addUserGif(uploaderToken, {
    createdAt: '2026-04-30T18:07:00.000Z',
    fileName: seededSharedGif.fileName,
    id: 'gif-viewer-reuse-after-limit',
    mediaUrl: seededSharedGif.mediaUrl,
    mimeType: 'image/gif',
    size: seededSharedGif.size,
    source: 'viewer',
    width: seededSharedGif.width,
    height: seededSharedGif.height,
  })

  assert.equal(addResult.snapshot.session.gifLibrary?.length ?? 0, 1)
  assert.equal(store.searchUserGifs(uploaderToken, 'pikachu').items.length, 1)
})

test('gif monthly upload limit is documented in analytics catalog and rollout docs', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const analyticsSource = readFileSync(join(repoRoot, 'src', 'shared', 'analytics.ts'), 'utf8')
  const appSource = readFileSync(join(repoRoot, 'src', 'App.tsx'), 'utf8')
  const analyticsDoc = readFileSync(join(repoRoot, 'docs', 'analytics-instrumentation.md'), 'utf8')
  const rolloutDoc = readFileSync(join(repoRoot, 'docs', 'staging-rollout-status.md'), 'utf8')
  const handoffDoc = readFileSync(join(repoRoot, 'docs', 'next-branch-handoff.md'), 'utf8')

  assert.match(analyticsSource, /'gif_upload_monthly_limit_reached'/u)
  assert.match(
    analyticsSource,
    /gif_upload_monthly_limit_reached: \{[\s\S]*скрытый лимит загрузки своих GIF/u,
  )
  assert.match(
    appSource,
    /trackAnalyticsEvent\('gif_upload_monthly_limit_reached', \{[\s\S]*userIdentifier: session\.identifier/u,
  )
  assert.match(analyticsDoc, /gif_upload_monthly_limit_reached/u)
  assert.match(analyticsDoc, /даёт `userIdentifier`, чтобы владельца можно было сразу найти в админке/u)
  assert.match(rolloutDoc, /скрытый server-side лимит `100` upload своих GIF/u)
  assert.match(handoffDoc, /upload своих GIF ограничен скрытым server-side лимитом `100`/u)
})
