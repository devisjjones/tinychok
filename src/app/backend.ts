import type {
  AppSnapshot,
  CreateGroupBody,
  CreateGroupResponse,
  CreateManagedChannelBody,
  CreateManagedChannelResponse,
  DiscoverySearchResponse,
  InviteGroupMemberBody,
  MutationResponse,
  OpenDirectDialogBody,
  OpenDirectDialogResponse,
  ReportContactBody,
  ReportSubscriptionChannelBody,
  RegisterResponse,
  RequestCodeResponse,
  RealtimeEvent,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendManagedChannelPostBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  SendGroupThreadCommentBody,
  SendSubscriptionChannelThreadCommentBody,
  UpdateDialogBody,
  UpdateGroupBody,
  UpdateManagedChannelBody,
  UpdateSubscriptionChannelBody,
  UpdateSessionBody,
  UploadMediaKind,
  UploadMediaResponse,
  VerifyCodeResponse,
} from '../shared/backend'
import type { RegisterBody, RequestCodeBody, SaveSnapshotBody, VerifyCodeBody } from '../shared/backend'
import type { SearchResult } from './types'

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/u, '')
}

function getRuntimeApiBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)
}

function getRuntimeWsBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL)
}

function makeHttpUrl(pathname: string) {
  const apiBaseUrl = getRuntimeApiBaseUrl()
  return apiBaseUrl ? `${apiBaseUrl}${pathname}` : pathname
}

function makeAbsoluteUrl(pathname: string, baseUrl: string) {
  return new URL(pathname, `${baseUrl}/`).toString()
}

function resolveMediaUrl(mediaUrl: string) {
  if (/^(?:https?:\/\/|blob:|data:)/u.test(mediaUrl)) {
    return mediaUrl
  }

  if (mediaUrl.startsWith('/assets/')) {
    if (typeof window !== 'undefined') {
      return makeAbsoluteUrl(mediaUrl, window.location.origin)
    }

    return mediaUrl
  }

  const apiBaseUrl = getRuntimeApiBaseUrl()
  if (apiBaseUrl) {
    return makeAbsoluteUrl(mediaUrl, apiBaseUrl)
  }

  if (typeof window !== 'undefined') {
    return makeAbsoluteUrl(mediaUrl, window.location.origin)
  }

  return mediaUrl
}

function normalizeSourceGroup(sourceGroup: AppSnapshot['chats'][number]['messages'][number]['sourceGroup']) {
  if (!sourceGroup) return sourceGroup

  return {
    ...sourceGroup,
    avatarImage: sourceGroup.avatarImage ? resolveMediaUrl(sourceGroup.avatarImage) : sourceGroup.avatarImage,
  }
}

function normalizeMessageMedia<T extends AppSnapshot['chats'][number]['messages'][number]>(message: T): T {
  return {
    ...message,
    attachment: message.attachment
      ? {
          ...message.attachment,
          mediaUrl: resolveMediaUrl(message.attachment.mediaUrl),
        }
      : undefined,
    sourceGroup: normalizeSourceGroup(message.sourceGroup),
  }
}

function normalizeSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      avatarImage: snapshot.session.avatarImage
        ? resolveMediaUrl(snapshot.session.avatarImage)
        : snapshot.session.avatarImage,
    },
    channels: snapshot.channels.map((channel) => ({
      ...channel,
      avatarImage: channel.avatarImage ? resolveMediaUrl(channel.avatarImage) : channel.avatarImage,
    })),
    chats: snapshot.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message) => normalizeMessageMedia(message)),
    })),
    groups: snapshot.groups.map((group) => ({
      ...group,
      avatarImage: group.avatarImage ? resolveMediaUrl(group.avatarImage) : group.avatarImage,
      messages: group.messages.map((message) => normalizeMessageMedia(message)),
    })),
    subscriptionChannels: snapshot.subscriptionChannels.map((channel) => ({
      ...channel,
      posts: channel.posts.map((post) => ({
        ...post,
        attachment: post.attachment
          ? {
              ...post.attachment,
              mediaUrl: resolveMediaUrl(post.attachment.mediaUrl),
            }
          : undefined,
      })),
    })),
  }
}

function normalizeMutationResponse(response: MutationResponse) {
  return {
    ...response,
    snapshot: normalizeSnapshot(response.snapshot),
  }
}

async function readJsonResponse<T>(response: Response) {
  const payload = (await response.json()) as T | { message?: string }

  if (!response.ok) {
    const apiError = payload as { message?: string }
    const message = typeof apiError.message === 'string'
      ? apiError.message
      : 'Не удалось выполнить запрос к серверу.'
    throw new Error(message)
  }

  return payload as T
}

function makeJsonRequestInit(
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  token?: string,
): RequestInit {
  return {
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    method,
  }
}

export async function requestAuthCode(body: RequestCodeBody) {
  const response = await fetch(makeHttpUrl('/api/auth/request-code'), makeJsonRequestInit('POST', body))
  return readJsonResponse<RequestCodeResponse>(response)
}

export async function verifyAuthCode(body: VerifyCodeBody) {
  const response = await fetch(makeHttpUrl('/api/auth/verify-code'), makeJsonRequestInit('POST', body))
  const payload = await readJsonResponse<VerifyCodeResponse>(response)
  return payload.status === 'authenticated'
    ? {
        ...payload,
        snapshot: normalizeSnapshot(payload.snapshot),
      }
    : payload
}

export async function registerAccount(body: RegisterBody) {
  const response = await fetch(makeHttpUrl('/api/auth/register'), makeJsonRequestInit('POST', body))
  const payload = await readJsonResponse<RegisterResponse>(response)
  return {
    ...payload,
    snapshot: normalizeSnapshot(payload.snapshot),
  }
}

export async function fetchBootstrap(sessionToken: string) {
  const response = await fetch(makeHttpUrl('/api/bootstrap'), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AppSnapshot>(response)
  return normalizeSnapshot(payload)
}

export async function searchDiscoveryResults(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/discovery'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<DiscoverySearchResponse>(response)
  return payload.results as SearchResult[]
}

export async function saveSnapshot(sessionToken: string, snapshot: AppSnapshot) {
  const response = await fetch(makeHttpUrl('/api/snapshot'), {
    body: JSON.stringify({ snapshot } satisfies SaveSnapshotBody),
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })

  const payload = await readJsonResponse<AppSnapshot>(response)
  return normalizeSnapshot(payload)
}

export async function updateSession(sessionToken: string, body: UpdateSessionBody) {
  const response = await fetch(makeHttpUrl('/api/session'), makeJsonRequestInit('PUT', body, sessionToken))
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function uploadMediaFile(
  sessionToken: string,
  file: File,
  kind: UploadMediaKind,
) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(makeHttpUrl(`/api/media?kind=${encodeURIComponent(kind)}`), {
    body: formData,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    method: 'POST',
  })

  const payload = await readJsonResponse<UploadMediaResponse>(response)
  return {
    ...payload,
    mediaUrl: resolveMediaUrl(payload.mediaUrl),
  }
}

export async function sendDirectMessage(
  sessionToken: string,
  dialogId: number,
  body: SendDirectMessageBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/messages`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function openDirectDialog(
  sessionToken: string,
  body: OpenDirectDialogBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/dialogs'),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<OpenDirectDialogResponse>(response)
  return {
    ...payload,
    snapshot: normalizeSnapshot(payload.snapshot),
  }
}

export async function setDialogFavorite(
  sessionToken: string,
  dialogId: number,
  body: SetDialogFavoriteBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/favorite`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function reportContact(
  sessionToken: string,
  dialogId: number,
  body: ReportContactBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/report`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function updateDialog(
  sessionToken: string,
  dialogId: number,
  body: UpdateDialogBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function setDialogPinnedMessage(
  sessionToken: string,
  dialogId: number,
  body: SetDialogPinnedMessageBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/pinned-message`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteDialogMessage(
  sessionToken: string,
  dialogId: number,
  messageId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/messages/${messageId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteDialogHistory(sessionToken: string, dialogId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/history`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteDialog(sessionToken: string, dialogId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function sendGroupMessage(
  sessionToken: string,
  groupId: number,
  body: SendGroupMessageBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function markDialogRead(sessionToken: string, dialogId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/dialogs/${dialogId}/read`),
    makeJsonRequestInit('POST', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteGroupMessage(
  sessionToken: string,
  groupId: number,
  messageId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function markGroupRead(sessionToken: string, groupId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/read`),
    makeJsonRequestInit('POST', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function sendGroupThreadComment(
  sessionToken: string,
  groupId: number,
  messageId: number,
  body: SendGroupThreadCommentBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}/comments`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteGroupThreadComment(
  sessionToken: string,
  groupId: number,
  messageId: number,
  commentId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}/comments/${commentId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function sendManagedChannelPost(
  sessionToken: string,
  channelId: number,
  body: SendManagedChannelPostBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/managed-channels/${channelId}/posts`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function markSubscriptionChannelRead(sessionToken: string, channelId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/read`),
    makeJsonRequestInit('POST', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function updateSubscriptionChannel(
  sessionToken: string,
  channelId: number,
  body: UpdateSubscriptionChannelBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function sendSubscriptionChannelThreadComment(
  sessionToken: string,
  channelId: number,
  postId: number,
  body: SendSubscriptionChannelThreadCommentBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/posts/${postId}/comments`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteSubscriptionChannelThreadComment(
  sessionToken: string,
  channelId: number,
  postId: number,
  commentId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/posts/${postId}/comments/${commentId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function leaveSubscriptionChannel(sessionToken: string, channelId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function reportSubscriptionChannel(
  sessionToken: string,
  channelId: number,
  body: ReportSubscriptionChannelBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/report`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function createManagedChannel(
  sessionToken: string,
  body: CreateManagedChannelBody,
) {
  const response = await fetch(makeHttpUrl('/api/channels'), makeJsonRequestInit('POST', body, sessionToken))
  const payload = await readJsonResponse<CreateManagedChannelResponse>(response)
  return {
    ...payload,
    snapshot: normalizeSnapshot(payload.snapshot),
  }
}

export async function updateManagedChannel(
  sessionToken: string,
  channelId: number,
  body: UpdateManagedChannelBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/channels/${channelId}`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function deleteManagedChannel(sessionToken: string, channelId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/channels/${channelId}`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function createGroup(sessionToken: string, body: CreateGroupBody) {
  const response = await fetch(makeHttpUrl('/api/groups'), makeJsonRequestInit('POST', body, sessionToken))
  const payload = await readJsonResponse<CreateGroupResponse>(response)
  return {
    ...payload,
    snapshot: normalizeSnapshot(payload.snapshot),
  }
}

export async function updateGroup(
  sessionToken: string,
  groupId: number,
  body: UpdateGroupBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}`),
    makeJsonRequestInit('PUT', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function inviteGroupMember(
  sessionToken: string,
  groupId: number,
  body: InviteGroupMemberBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/invite`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function leaveGroup(sessionToken: string, groupId: number) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/membership`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export function openRealtimeConnection(
  sessionToken: string,
  onEvent: (event: RealtimeEvent) => void,
) {
  const wsBaseUrl =
    getRuntimeWsBaseUrl() ??
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
  const socket = new WebSocket(
    `${wsBaseUrl}/ws?token=${encodeURIComponent(sessionToken)}`,
  )

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data) as RealtimeEvent
    onEvent(
      payload.type === 'connection.ready' || payload.type === 'snapshot.updated'
        ? {
            ...payload,
            snapshot: normalizeSnapshot(payload.snapshot),
          }
        : payload,
    )
  })

  return socket
}
