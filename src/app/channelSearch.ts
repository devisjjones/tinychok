import type { Channel, ChannelSearchResult, SubscriptionChannel } from './types'
import { sanitizeChannelDirectLink } from '../shared/utils'

export type SearchChannelOpenTarget =
  | {
      kind: 'subscribed'
      channelId: number
    }
  | {
      kind: 'managed-preview'
      managedChannelId: number
    }
  | {
      kind: 'preview-by-handle'
      handle: string
    }

export function resolveSearchChannelOpenTarget(
  result: ChannelSearchResult,
  subscriptionChannels: SubscriptionChannel[],
  managedChannels: Channel[],
): SearchChannelOpenTarget {
  // Search resolver prefers exact handle and never falls back by title alone:
  // one visible result must never open another channel with a similar title.
  const normalizedHandle = sanitizeChannelDirectLink(result.handle)

  if (normalizedHandle) {
    const subscribedByHandle = subscriptionChannels.find(
      (channel) => sanitizeChannelDirectLink(channel.handle) === normalizedHandle,
    )
    if (subscribedByHandle) {
      return {
        kind: 'subscribed',
        channelId: subscribedByHandle.id,
      }
    }

    const managedByHandle = managedChannels.find(
      (channel) => sanitizeChannelDirectLink(channel.directLink) === normalizedHandle,
    )
    if (managedByHandle) {
      return {
        kind: 'managed-preview',
        managedChannelId: managedByHandle.id,
      }
    }
  }

  const subscribedByExactId = subscriptionChannels.find((channel) => channel.id === result.id)
  if (subscribedByExactId) {
    return {
      kind: 'subscribed',
      channelId: subscribedByExactId.id,
    }
  }

  const managedByExactId = managedChannels.find((channel) => channel.id === result.id)
  if (managedByExactId) {
    return {
      kind: 'managed-preview',
      managedChannelId: managedByExactId.id,
    }
  }

  return {
    kind: 'preview-by-handle',
    handle: normalizedHandle || result.handle,
  }
}
