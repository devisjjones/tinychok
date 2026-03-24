export const displayNameFieldMaxLength = 24
export const surnameFieldMaxLength = 32
export const nicknameFieldMaxLength = 16
export const statusFieldMaxLength = 80
export const accountNameMaxFontSize = 30.4
export const accountNameMinFontSize = 20
export const accountStatusMaxFontSize = 15
export const accountStatusMinFontSize = 10.5
export const defaultGroupMemberLimit = 10
export const premiumGroupMemberLimit = 200
export const groupTitleMaxLength = 48
export const channelTitleMaxLength = 30
export const channelDirectLinkMaxLength = 30
export const channelDescriptionMaxLength = 160
export const managedChannelsPerUserLimit = 5
export const channelActionMenuWidth = 280
export const channelActionMenuHeight = 132
export const channelBlockedMenuHeight = 146
export const groupActionMenuWidth = 280
export const groupActionMenuHeight = 228
export const avatarSourceMaxSizeBytes = 5 * 1024 * 1024
export const avatarAcceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const avatarOutputSizePx = 512
export const avatarPreviewSizePx = 128
export const channelAvatarUploadMaxSizeBytes = avatarSourceMaxSizeBytes
export const channelAvatarUploadAcceptedMimeTypes = avatarAcceptedMimeTypes
export const messagePhotoUploadMaxSizeBytes = 10 * 1024 * 1024
export const messageFileUploadMaxSizeBytes = 10 * 1024 * 1024
export const messageGifUploadMaxSizeBytes = 5 * 1024 * 1024
export const messagePhotoAcceptedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const messageFileAcceptedMimeTypes = [
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-zip-compressed',
  'application/zip',
  'text/plain',
] as const
export const messageFileAcceptedExtensions = [
  '.doc',
  '.docx',
  '.pdf',
  '.txt',
  '.xls',
  '.xlsx',
  '.zip',
] as const
export const messagePhotoMaxDimensionPx = 1600
export const messagePhotoCompressionTargetBytes = 1_600_000
export const freeStorageQuotaBytes = 50 * 1024 * 1024
export const premiumStorageQuotaBytes = 500 * 1024 * 1024
export const orphanUploadTtlMs = 24 * 60 * 60 * 1000
export const chatActionMenuWidth = 320
export const chatActionMenuHeight = 290
export const quickFilters = ['Все', '★']
export const channelAvatarTones = ['#8c5738', '#6eb6ff', '#ff8a5b', '#82c9a3', '#f29f67', '#d18fff']
export const accountsStorageKey = 'tinychok.accounts'
export const sessionStorageKey = 'tinychok.session'
export const cookieConsentStorageKey = 'tinychok.cookie-consent'
export const premiumDebugAutoCheckoutStorageKey = 'tinychok.debug.premium-auto-checkout'
export const messagePhotoSendOriginalPreferenceStorageKey = 'tinychok.session.photo-send-original'
