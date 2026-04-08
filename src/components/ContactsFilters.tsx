import { contactTabs, getContactsTabBadgeCount, shouldShowContactsTabBadge, type ContactsTabKey } from '../app/contactsContract'
import { getContactRequestCardIconPath } from '../app/iconContracts'

type ContactsFiltersProps = {
  contactsTab: ContactsTabKey
  formatUnreadBadgeCount: (count: number) => string
  incomingContactRequestCount: number
  onSelectTab: (tab: ContactsTabKey) => void
  outgoingContactRequestCount: number
  suppressContactRequestBadges: boolean
}

export function ContactsFilters({
  contactsTab,
  formatUnreadBadgeCount,
  incomingContactRequestCount,
  onSelectTab,
  outgoingContactRequestCount,
  suppressContactRequestBadges,
}: ContactsFiltersProps) {
  return (
    <>
      {contactTabs.map((tab) => {
        const badgeCount = getContactsTabBadgeCount(
          tab.key,
          incomingContactRequestCount,
          outgoingContactRequestCount,
        )
        // Quiet mode only suppresses the visual badge layer. Pending counts stay
        // intact so the request lifecycle and room state are unchanged.
        const showBadge = shouldShowContactsTabBadge(
          tab.key,
          suppressContactRequestBadges,
          incomingContactRequestCount,
          outgoingContactRequestCount,
        )
        const badgeClassName =
          badgeCount > 9
            ? tab.badgeTone === 'light'
              ? 'filter-badge filter-badge-light filter-badge-wide'
              : 'filter-badge filter-badge-wide'
            : tab.badgeTone === 'light'
              ? 'filter-badge filter-badge-light'
              : 'filter-badge'

        return (
          <button
            key={tab.key}
            type="button"
            className={contactsTab === tab.key ? 'filter contacts-filter active' : 'filter contacts-filter'}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => onSelectTab(tab.key)}
          >
            {tab.key === 'all' ? (
              <span>{tab.label}</span>
            ) : (
              <span className="contacts-filter-content">
                <img
                  className="filter-icon contacts-filter-icon"
                  src={getContactRequestCardIconPath(tab.key === 'incoming' ? 'incoming' : 'outgoing')}
                  alt={tab.label}
                />
              </span>
            )}
            {showBadge ? (
              <span className={badgeClassName}>
                {formatUnreadBadgeCount(badgeCount)}
              </span>
            ) : null}
          </button>
        )
      })}
    </>
  )
}
