import { useCallback } from 'react'
import type { AppSnapshot } from '../shared/backend'
import type { Chat, ContactRequestPreview } from './types'
import {
  acceptContactRequest as acceptContactRequestRequest,
  blockContactRequest as blockContactRequestRequest,
  cancelContactRequest as cancelContactRequestRequest,
  openDirectDialog as openDirectDialogRequest,
  rejectContactRequest as rejectContactRequestRequest,
  sendContactRequest as sendContactRequestRequest,
} from './backend'
import { normalizeIdentifier } from './utils'

type UseContactRequestsFlowArgs = {
  applySnapshot: (snapshot: AppSnapshot) => void
  backendReady: boolean
  chats: Chat[]
  openChatInContacts: (chatId: number) => void
  sessionToken?: string
  setContactRequestActionBusy: (busy: boolean) => void
  setContactRequestActionError: (error: string) => void
  setContactRequestBusy: (busy: boolean) => void
  setContactRequestError: (error: string) => void
}

export function useContactRequestsFlow({
  applySnapshot,
  backendReady,
  chats,
  openChatInContacts,
  sessionToken,
  setContactRequestActionBusy,
  setContactRequestActionError,
  setContactRequestBusy,
  setContactRequestError,
}: UseContactRequestsFlowArgs) {
  const openContactRequestRoom = useCallback(
    async (identifier: string) => {
      const normalizedIdentifier = normalizeIdentifier(identifier)
      const existingChat = chats.find(
        (chat) => normalizeIdentifier(chat.phone) === normalizedIdentifier,
      )
      if (existingChat) {
        // Contact request rooms are a Contacts-surface flow: reopening them must
        // keep the user in Contacts instead of jumping back to the Chats list.
        openChatInContacts(existingChat.id)
        return
      }

      if (backendReady && sessionToken) {
        try {
          const response = await openDirectDialogRequest(sessionToken, {
            identifier: normalizedIdentifier || identifier,
          })
          applySnapshot(response.snapshot)
          openChatInContacts(response.dialogId)
          return
        } catch (error) {
          console.error('Failed to open direct dialog from contact request', error)
        }
      }
    },
    [applySnapshot, backendReady, chats, openChatInContacts, sessionToken],
  )

  const openIncomingContactRequest = useCallback(
    (request: ContactRequestPreview) => {
      void openContactRequestRoom(request.identifier)
    },
    [openContactRequestRoom],
  )

  const openOutgoingContactRequest = useCallback(
    (request: ContactRequestPreview) => {
      void openContactRequestRoom(request.identifier)
    },
    [openContactRequestRoom],
  )

  const actOnContactRequest = useCallback(
    async (identifier: string, action: 'accept' | 'cancel' | 'reject' | 'block') => {
      if (!sessionToken || !backendReady) return

      setContactRequestActionBusy(true)
      setContactRequestActionError('')

      try {
        const response =
          action === 'accept'
            ? await acceptContactRequestRequest(sessionToken, identifier)
            : action === 'cancel'
              ? await cancelContactRequestRequest(sessionToken, identifier)
              : action === 'reject'
                ? await rejectContactRequestRequest(sessionToken, identifier)
                : await blockContactRequestRequest(sessionToken, identifier)
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error(`Failed to ${action} contact request`, error)
        setContactRequestActionError(
          error instanceof Error ? error.message : 'Не удалось обработать заявку на контакт.',
        )
      } finally {
        setContactRequestActionBusy(false)
      }
    },
    [
      applySnapshot,
      backendReady,
      sessionToken,
      setContactRequestActionBusy,
      setContactRequestActionError,
    ],
  )

  const sendContactRequestForIdentifier = useCallback(
    async (identifier: string) => {
      if (!identifier || !sessionToken || !backendReady) return

      setContactRequestBusy(true)
      setContactRequestError('')

      try {
        const response = await sendContactRequestRequest(sessionToken, {
          identifier,
        })
        applySnapshot(response.snapshot)
      } catch (error) {
        console.error('Failed to send contact request', error)
        setContactRequestError(
          error instanceof Error ? error.message : 'Не удалось отправить заявку на контакт.',
        )
      } finally {
        setContactRequestBusy(false)
      }
    },
    [
      applySnapshot,
      backendReady,
      sessionToken,
      setContactRequestBusy,
      setContactRequestError,
    ],
  )

  return {
    actOnContactRequest,
    openIncomingContactRequest,
    openOutgoingContactRequest,
    openContactRequestRoom,
    sendContactRequestForIdentifier,
  }
}
