import type { ReactNode } from 'react'
import { formatContactStatus, formatPreview, formatSidebarActivityLabel, normalizeIdentifier } from '../app/utils'
import type { Chat, ContactRequestPreview } from '../app/types'
import type { ContactsTabKey } from '../app/contactsContract'
import { ContactRequestCard } from './ContactRequestCard'

type ContactsPaneProps = {
  activeChatId: number | null
  activeContactIdentifier: string
  contactRequestActionBusy: boolean
  contactRequests: ContactRequestPreview[]
  contactsTab: ContactsTabKey
  onAcceptIncomingRequest: (identifier: string) => void
  onOpenAcceptedContact: (chatId: number) => void
  onOpenIncomingRequest: (request: ContactRequestPreview) => void
  onOpenOutgoingRequest: (request: ContactRequestPreview) => void
  orderedVisibleChats: Chat[]
  outgoingContactRequests: ContactRequestPreview[]
  renderAdminBlockedChatBadge: (chat: Pick<Chat, 'blockedByAdmin'>) => ReactNode
  renderAvatarContent: (title: string, archivedAccount?: boolean, avatarImage?: string) => ReactNode
}

export function ContactsPane({
  activeChatId,
  activeContactIdentifier,
  contactRequestActionBusy,
  contactRequests,
  contactsTab,
  onAcceptIncomingRequest,
  onOpenAcceptedContact,
  onOpenIncomingRequest,
  onOpenOutgoingRequest,
  orderedVisibleChats,
  outgoingContactRequests,
  renderAdminBlockedChatBadge,
  renderAvatarContent,
}: ContactsPaneProps) {
  const showIncomingRequestsInAllContacts = contactsTab === 'all' && contactRequests.length > 0
  const showOutgoingRequestsInAllContacts = contactsTab === 'all' && outgoingContactRequests.length > 0
  const showAcceptedContactsInContactsTab = contactsTab === 'all'

  return (
    <>
      {contactsTab === 'all' ? (
        <>
          {showIncomingRequestsInAllContacts ? (
            <div className="contacts-section">
              <p className="room-forward-section-title contacts-section-title">Заявки</p>
              {contactRequests.map((request) => (
                <ContactRequestCard
                  key={`incoming-contact-request-${request.identifier}`}
                  request={request}
                  direction="incoming"
                  active={normalizeIdentifier(activeContactIdentifier) === normalizeIdentifier(request.identifier)}
                  actionBusy={contactRequestActionBusy}
                  onAcceptIncomingRequest={onAcceptIncomingRequest}
                  onOpenRoom={onOpenIncomingRequest}
                  renderAvatarContent={renderAvatarContent}
                />
              ))}
            </div>
          ) : null}
          {showOutgoingRequestsInAllContacts ? (
            <div className="contacts-section">
              <p className="room-forward-section-title contacts-section-title">Отправленные запросы</p>
              {outgoingContactRequests.map((request) => (
                <ContactRequestCard
                  key={`outgoing-contact-request-${request.identifier}`}
                  request={request}
                  direction="outgoing"
                  active={normalizeIdentifier(activeContactIdentifier) === normalizeIdentifier(request.identifier)}
                  actionBusy={contactRequestActionBusy}
                  onAcceptIncomingRequest={onAcceptIncomingRequest}
                  onOpenRoom={onOpenOutgoingRequest}
                  renderAvatarContent={renderAvatarContent}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {contactsTab === 'incoming' ? (
        <div className="contacts-section">
          {contactRequests.length > 0 ? (
            contactRequests.map((request) => (
              <ContactRequestCard
                key={`incoming-tab-contact-request-${request.identifier}`}
                request={request}
                direction="incoming"
                active={normalizeIdentifier(activeContactIdentifier) === normalizeIdentifier(request.identifier)}
                actionBusy={contactRequestActionBusy}
                onAcceptIncomingRequest={onAcceptIncomingRequest}
                onOpenRoom={onOpenIncomingRequest}
                renderAvatarContent={renderAvatarContent}
              />
            ))
          ) : (
            <p className="contacts-empty-note">Заявок пока нет</p>
          )}
        </div>
      ) : null}
      {contactsTab === 'outgoing' ? (
        <div className="contacts-section">
          {outgoingContactRequests.length > 0 ? (
            outgoingContactRequests.map((request) => (
              <ContactRequestCard
                key={`outgoing-tab-contact-request-${request.identifier}`}
                request={request}
                direction="outgoing"
                active={normalizeIdentifier(activeContactIdentifier) === normalizeIdentifier(request.identifier)}
                actionBusy={contactRequestActionBusy}
                onAcceptIncomingRequest={onAcceptIncomingRequest}
                onOpenRoom={onOpenOutgoingRequest}
                renderAvatarContent={renderAvatarContent}
              />
            ))
          ) : (
            <p className="contacts-empty-note">Отправленных заявок пока нет</p>
          )}
        </div>
      ) : null}
      {showAcceptedContactsInContactsTab ? (
        <div className="contacts-section">
          <p className="room-forward-section-title contacts-section-title">Контакты</p>
          {orderedVisibleChats.length > 0 ? (
            orderedVisibleChats.map((chat) => {
              const latestMessage = chat.messages.at(-1)
              const chatPreview = chat.messages.length > 0 ? formatPreview(chat) : formatContactStatus(chat)

              return (
                <button
                  key={chat.id}
                  type="button"
                  className={chat.id === activeChatId ? 'chat-card contact-list-card active' : 'chat-card contact-list-card'}
                  onClick={() => onOpenAcceptedContact(chat.id)}
                >
                  <span className="chat-avatar-stack">
                    <span className="avatar" style={{ backgroundColor: chat.accent }}>
                      {renderAvatarContent(chat.title, chat.archivedAccount, chat.avatarImage)}
                    </span>
                    {chat.online ? <span className="presence-dot" aria-label="В сети" /> : null}
                  </span>
                  <span className="chat-copy">
                    <span className="chat-topline">
                      <span className="chat-name-row">
                        <strong className="chat-name-text">{chat.title}</strong>
                        {chat.archivedAccount ? <span className="chat-archive-badge">Удалён</span> : null}
                        {renderAdminBlockedChatBadge(chat)}
                        {chat.muted ? (
                          <span className="chat-star group-muted-indicator" aria-label="Уведомления выключены">
                            <img src="/icons/bell-100.png" alt="" />
                          </span>
                        ) : null}
                        {chat.premium ? (
                          <span className="premium-crown chat-crown" aria-label="Премиум">
                            <img src="/icons/crown64.png" alt="" />
                          </span>
                        ) : null}
                        {chat.pinned ? (
                          <span className="chat-star">
                            <img src="/icons/star100.png" alt="Избранный контакт" />
                          </span>
                        ) : null}
                      </span>
                      <span className="chat-topline-meta">
                        {formatSidebarActivityLabel(latestMessage?.createdAt, latestMessage?.time ?? '')}
                      </span>
                    </span>
                    <span className="chat-preview chat-status-preview">{chatPreview}</span>
                  </span>
                </button>
              )
            })
          ) : (
            <article className="chat-card search-card">
              <span className="chat-copy">
                <strong>Контактов пока нет</strong>
                <span className="chat-handle">Подтверждённые контакты появятся здесь.</span>
              </span>
            </article>
          )}
        </div>
      ) : null}
    </>
  )
}
