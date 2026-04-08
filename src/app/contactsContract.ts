export const contactTabs = [
  { badgeTone: 'none', key: 'all', label: 'Все' },
  { badgeTone: 'dark', key: 'incoming', label: 'Новые заявки' },
  { badgeTone: 'light', key: 'outgoing', label: 'Отправленные заявки' },
] as const

export type ContactsTabKey = (typeof contactTabs)[number]['key']

export function getContactsTabBadgeCount(
  key: ContactsTabKey,
  incomingContactRequestCount: number,
  outgoingContactRequestCount: number,
) {
  if (key === 'incoming') return incomingContactRequestCount
  if (key === 'outgoing') return outgoingContactRequestCount
  return 0
}

export function shouldShowContactsTabBadge(
  key: ContactsTabKey,
  suppressContactRequestBadges: boolean,
  incomingContactRequestCount: number,
  outgoingContactRequestCount: number,
) {
  if (suppressContactRequestBadges || key === 'all') return false

  return getContactsTabBadgeCount(
    key,
    incomingContactRequestCount,
    outgoingContactRequestCount,
  ) > 0
}
