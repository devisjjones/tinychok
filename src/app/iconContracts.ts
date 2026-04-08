export const quietToggleIcons = {
  active: '/icons/quiet.png',
  default: '/icons/quiet100.png',
} as const

export function getQuietToggleIconPath(quietMode: boolean) {
  return quietMode ? quietToggleIcons.active : quietToggleIcons.default
}

export const bottomChannelsActionIcons = {
  // Asset contract:
  // these icons are served directly by nginx from /public/icons and must stay world-readable
  // on disk (0644 or equivalent). Private perms like 0600 break staging after rsync deploys.
  premiumDisabled: '/icons/crown64.png',
  premiumEnabled: '/icons/news_settings.png',
} as const

export function getBottomChannelsActionIconPath(sessionHasPremium: boolean) {
  return sessionHasPremium
    ? bottomChannelsActionIcons.premiumEnabled
    : bottomChannelsActionIcons.premiumDisabled
}

export const contactRequestCardIcons = {
  incoming: '/icons/handshake.png',
  outgoing: '/icons/man-raising-hand.png',
} as const

export function getContactRequestCardIconPath(direction: 'incoming' | 'outgoing') {
  return contactRequestCardIcons[direction]
}
