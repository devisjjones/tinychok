import type { Message } from '../shared/types'

import { preservePendingAttachmentPreview } from './usePendingMessageOutbox'

type AttachmentCarrier = {
  attachment?: Message['attachment']
}

export function preserveMatchedOutgoingAttachmentPreview<
  LocalItem extends AttachmentCarrier,
  ConfirmedItem extends AttachmentCarrier,
>(localItem: LocalItem, confirmedItem: ConfirmedItem): ConfirmedItem {
  return {
    ...confirmedItem,
    attachment: preservePendingAttachmentPreview(localItem.attachment, confirmedItem.attachment),
  }
}

export function reconcileOutgoingItems<LocalItem, ConfirmedItem>(
  localItems: LocalItem[],
  confirmedItems: ConfirmedItem[],
  matcher: (localItem: LocalItem, confirmedItem: ConfirmedItem) => boolean,
  patchConfirmedItem?: (localItem: LocalItem, confirmedItem: ConfirmedItem) => ConfirmedItem,
) {
  if (localItems.length === 0 || confirmedItems.length === 0) {
    return {
      confirmedItems,
      unconfirmedLocalItems: localItems,
    }
  }

  const nextConfirmedItems = confirmedItems.slice()
  const usedConfirmedIndexes = new Set<number>()
  const unconfirmedLocalItems: LocalItem[] = []

  localItems.forEach((localItem) => {
    const matchedConfirmedIndex = nextConfirmedItems.findIndex(
      (confirmedItem, confirmedIndex) =>
        !usedConfirmedIndexes.has(confirmedIndex) && matcher(localItem, confirmedItem),
    )

    if (matchedConfirmedIndex === -1) {
      unconfirmedLocalItems.push(localItem)
      return
    }

    usedConfirmedIndexes.add(matchedConfirmedIndex)

    if (patchConfirmedItem) {
      nextConfirmedItems[matchedConfirmedIndex] = patchConfirmedItem(
        localItem,
        nextConfirmedItems[matchedConfirmedIndex]!,
      )
    }
  })

  return {
    confirmedItems: nextConfirmedItems,
    unconfirmedLocalItems,
  }
}
