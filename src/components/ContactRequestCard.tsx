import type { ReactNode } from 'react'
import { getContactRequestCardIconPath } from '../app/iconContracts'
import type { ContactRequestPreview } from '../app/types'

type ContactRequestCardProps = {
  active?: boolean
  actionBusy?: boolean
  direction: 'incoming' | 'outgoing'
  onAcceptIncomingRequest: (identifier: string) => void
  onOpenRoom: (request: ContactRequestPreview) => void
  renderAvatarContent: (title: string, archivedAccount?: boolean, avatarImage?: string) => ReactNode
  request: ContactRequestPreview
}

export function ContactRequestCard({
  active = false,
  actionBusy = false,
  direction,
  onAcceptIncomingRequest,
  onOpenRoom,
  renderAvatarContent,
  request,
}: ContactRequestCardProps) {
  const iconPath = getContactRequestCardIconPath(direction)
  const isIncoming = direction === 'incoming'
  const cardClassName = active
    ? 'chat-card contact-list-card chat-card-request active'
    : 'chat-card contact-list-card chat-card-request'

  return (
    <div
      key={`${direction}-contact-request-${request.identifier}`}
      className={cardClassName}
    >
      <button
        type="button"
        className="chat-card-request-main"
        onClick={() => onOpenRoom(request)}
      >
        <span className="chat-avatar-stack">
          <span className="avatar" style={{ backgroundColor: request.accent }}>
            {renderAvatarContent(request.title, false, request.avatarImage)}
          </span>
        </span>
        <span className="chat-copy">
          <span className="chat-topline">
            <span className="chat-name-row">
              <strong className="chat-name-text">{request.title}</strong>
              {request.premium ? (
                <span className="premium-crown chat-crown" aria-label="Премиум">
                  <img src="/icons/crown64.png" alt="" />
                </span>
              ) : null}
            </span>
          </span>
          <span className="chat-preview chat-status-preview">
            {isIncoming ? 'Хочет выйти на связь' : 'Заявка на контакт отправлена'}
          </span>
        </span>
      </button>
      {isIncoming ? (
        // Only incoming requests have a quick-accept affordance on the card.
        <button
          type="button"
          className="contact-request-card-action"
          aria-label="Подтвердить контакт"
          title="Подтвердить контакт"
          disabled={actionBusy}
          onClick={() => {
            onAcceptIncomingRequest(request.identifier)
          }}
        >
          <span className="contact-request-card-icon incoming">
            <img src={iconPath} alt="" />
          </span>
        </button>
      ) : (
        // Outgoing requests keep the right-side icon as a room entry-point, not
        // as a quick action: its tap target must mirror the card tap.
        <button
          type="button"
          className="contact-request-card-open contact-request-card-icon outgoing"
          aria-label="Открыть заявку"
          title="Открыть заявку"
          onClick={() => onOpenRoom(request)}
        >
          <img src={iconPath} alt="" />
        </button>
      )}
    </div>
  )
}
