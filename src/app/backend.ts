import type {
  AdminAuditCsvExportBody,
  AdminDashboardResponse,
  AdminAuditLogResponse,
  AdminBootstrapResponse,
  AdminContentCsvExportBody,
  AdminCsvExportResponse,
  AdminDialogsResponse,
  AdminDialogDetailResponse,
  AdminDialogLookupBody,
  AdminManagedChannelsResponse,
  AdminManagedGroupsResponse,
  AdminMediaDownloadBody,
  AdminMediaDownloadResponse,
  AdminMediaActionBody,
  AdminMediaListResponse,
  AdminReportActionBody,
  AdminReportDetailResponse,
  AdminReportNoteBody,
  AdminReportViewBody,
  AdminReportViewResponse,
  AdminReportsResponse,
  AdminUserBlockBody,
  AdminUserAvatarBody,
  AdminUserAvatarResponse,
  AdminUserDetailResponse,
  AdminUserPremiumBody,
  AdminUsersResponse,
  AdminThreadsResponse,
  AppSnapshot,
  ClientRuntimeConfigResponse,
  CreateGroupBody,
  CreateGroupResponse,
  CreateManagedChannelBody,
  CreateManagedChannelResponse,
  DebugPremiumBody,
  DiscoverySearchResponse,
  DirectDialogHistoryResponse,
  GroupHistoryResponse,
  InviteGroupMemberBody,
  InviteManagedChannelMembersBody,
  ManageSubscriptionChannelSubscriberBody,
  MutationResponse,
  OpenDirectDialogBody,
  OpenDirectDialogResponse,
  RegisterUserGifBody,
  ReportContactBody,
  ReportMediaBody,
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
  SubscriptionChannelHistoryResponse,
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
import type { SearchResult, ThreadComment } from './types'

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

function normalizeAttachmentMedia<T extends { mediaUrl: string }>(attachment: T): T {
  return {
    ...attachment,
    mediaUrl: resolveMediaUrl(attachment.mediaUrl),
  }
}

function normalizeThreadCommentMedia(comment: ThreadComment): ThreadComment {
  return {
    ...comment,
    attachment: comment.attachment ? normalizeAttachmentMedia(comment.attachment) : undefined,
  }
}

function normalizeMessageMedia<T extends AppSnapshot['chats'][number]['messages'][number]>(message: T): T {
  return {
    ...message,
    attachment: message.attachment ? normalizeAttachmentMedia(message.attachment) : undefined,
    sourceGroup: normalizeSourceGroup(message.sourceGroup),
    threadComments: message.threadComments?.map((comment) => normalizeThreadCommentMedia(comment)),
  }
}

function normalizeDialogMessages(messages: DirectDialogHistoryResponse['messages']) {
  return messages.map((message) => normalizeMessageMedia(message))
}

function normalizeGroupMessages(messages: GroupHistoryResponse['messages']) {
  return messages.map((message) => normalizeMessageMedia(message))
}

function normalizeChannelPosts(posts: SubscriptionChannelHistoryResponse['posts']) {
  return posts.map((post) => ({
    ...post,
    attachment: post.attachment ? normalizeAttachmentMedia(post.attachment) : undefined,
    threadComments: post.threadComments?.map((comment) => normalizeThreadCommentMedia(comment)),
  }))
}

function normalizeSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      avatarImage: snapshot.session.avatarImage
        ? resolveMediaUrl(snapshot.session.avatarImage)
        : snapshot.session.avatarImage,
      gifLibrary: snapshot.session.gifLibrary?.map((gif) => normalizeAttachmentMedia(gif)),
    },
    channels: snapshot.channels.map((channel) => ({
      ...channel,
      avatarImage: channel.avatarImage ? resolveMediaUrl(channel.avatarImage) : channel.avatarImage,
    })),
    chats: snapshot.chats.map((chat) => ({
      ...chat,
      pinnedMessage: chat.pinnedMessage ? normalizeMessageMedia(chat.pinnedMessage) : chat.pinnedMessage,
      messages: chat.messages.map((message) => normalizeMessageMedia(message)),
    })),
    groups: snapshot.groups.map((group) => ({
      ...group,
      avatarImage: group.avatarImage ? resolveMediaUrl(group.avatarImage) : group.avatarImage,
      messages: group.messages.map((message) => normalizeMessageMedia(message)),
    })),
    subscriptionChannels: snapshot.subscriptionChannels.map((channel) => ({
      ...channel,
      avatarImage: channel.avatarImage ? resolveMediaUrl(channel.avatarImage) : channel.avatarImage,
      posts: channel.posts.map((post) => normalizeChannelPosts([post])[0]),
    })),
    threadInbox: snapshot.threadInbox,
  }
}

function normalizeMutationResponse(response: MutationResponse) {
  return {
    ...response,
    snapshot: normalizeSnapshot(response.snapshot),
  }
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readJsonResponse<T>(response: Response) {
  const payload = (await response.json()) as T | { message?: string }

  if (!response.ok) {
    const apiError = payload as { message?: string }
    const message = typeof apiError.message === 'string'
      ? apiError.message
      : 'Не удалось выполнить запрос к серверу.'
    throw new ApiError(message, response.status)
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

function isRetryableSessionUpdateFallbackError(error: unknown) {
  if (error instanceof ApiError) {
    return error.status === 404 || error.status === 405 || error.status === 501
  }

  return error instanceof TypeError || (error instanceof Error && /failed to fetch/i.test(error.message))
}

async function readMutationWithDeletePostFallback(
  pathname: string,
  sessionToken: string,
) {
  try {
    const response = await fetch(makeHttpUrl(pathname), makeJsonRequestInit('DELETE', undefined, sessionToken))
    return await readJsonResponse<MutationResponse>(response)
  } catch (error) {
    if (!isRetryableSessionUpdateFallbackError(error)) {
      throw error
    }

    const response = await fetch(makeHttpUrl(pathname), makeJsonRequestInit('POST', undefined, sessionToken))
    return await readJsonResponse<MutationResponse>(response)
  }
}

export async function requestAuthCode(body: RequestCodeBody) {
  const response = await fetch(makeHttpUrl('/api/auth/request-code'), makeJsonRequestInit('POST', body))
  return readJsonResponse<RequestCodeResponse>(response)
}

export async function fetchClientRuntimeConfig() {
  const response = await fetch(makeHttpUrl('/api/client-config'))
  return readJsonResponse<ClientRuntimeConfigResponse>(response)
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

export async function fetchDirectDialogHistory(
  sessionToken: string,
  dialogId: number,
  beforeMessageId: number,
) {
  const requestUrl = new URL(makeHttpUrl(`/api/dialogs/${dialogId}/history`), window.location.origin)
  requestUrl.searchParams.set('beforeId', String(beforeMessageId))

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<DirectDialogHistoryResponse>(response)

  return {
    ...payload,
    messages: normalizeDialogMessages(payload.messages),
  }
}

export async function fetchGroupHistory(
  sessionToken: string,
  groupId: number,
  beforeMessageId: number,
) {
  const requestUrl = new URL(makeHttpUrl(`/api/groups/${groupId}/history`), window.location.origin)
  requestUrl.searchParams.set('beforeId', String(beforeMessageId))

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<GroupHistoryResponse>(response)

  return {
    ...payload,
    messages: normalizeGroupMessages(payload.messages),
  }
}

export async function fetchSubscriptionChannelHistory(
  sessionToken: string,
  channelId: number,
  beforePostId: number,
) {
  const requestUrl = new URL(
    makeHttpUrl(`/api/subscription-channels/${channelId}/history`),
    window.location.origin,
  )
  requestUrl.searchParams.set('beforeId', String(beforePostId))

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<SubscriptionChannelHistoryResponse>(response)

  return {
    ...payload,
    posts: normalizeChannelPosts(payload.posts),
  }
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

export async function fetchAdminBootstrap(sessionToken: string) {
  const response = await fetch(makeHttpUrl('/api/admin/bootstrap'), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminBootstrapResponse>(response)
}

export async function fetchAdminDashboard(sessionToken: string) {
  const response = await fetch(makeHttpUrl('/api/admin/dashboard'), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminDashboardResponse>(response)
}

export async function searchAdminUsers(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/users'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AdminUsersResponse>(response)
  return {
    blockedUsers: payload.blockedUsers,
    totalUsers: payload.totalUsers,
    users: payload.users.map((user) => ({
      ...user,
      avatarImage: user.avatarImage ? resolveMediaUrl(user.avatarImage) : user.avatarImage,
    })),
  }
}

export async function fetchAdminUser(sessionToken: string, identifier: string) {
  const response = await fetch(makeHttpUrl(`/api/admin/users/${encodeURIComponent(identifier)}`), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AdminUserDetailResponse>(response)
  return {
    user: {
      ...payload.user,
      avatarImage: payload.user.avatarImage ? resolveMediaUrl(payload.user.avatarImage) : payload.user.avatarImage,
    },
  }
}

export async function blockAdminUser(
  sessionToken: string,
  identifier: string,
  body: AdminUserBlockBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/users/${encodeURIComponent(identifier)}/block`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminUserDetailResponse>(response)
}

export async function unblockAdminUser(
  sessionToken: string,
  identifier: string,
  body: AdminUserBlockBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/users/${encodeURIComponent(identifier)}/unblock`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminUserDetailResponse>(response)
}

export async function setAdminUserPremium(
  sessionToken: string,
  identifier: string,
  body: AdminUserPremiumBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/users/${encodeURIComponent(identifier)}/premium`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminUserDetailResponse>(response)
}

export async function fetchAdminReports(
  sessionToken: string,
  status?: 'open' | 'closed',
) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/reports'), window.location.origin)
  if (status) {
    requestUrl.searchParams.set('status', status)
  }

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminReportsResponse>(response)
}

export async function fetchAdminReport(sessionToken: string, reportId: string) {
  const response = await fetch(makeHttpUrl(`/api/admin/reports/${encodeURIComponent(reportId)}`), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminReportDetailResponse>(response)
}

export async function addAdminReportNote(
  sessionToken: string,
  reportId: string,
  body: AdminReportNoteBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/reports/${encodeURIComponent(reportId)}/notes`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminReportDetailResponse>(response)
}

export async function viewAdminReportEntity(
  sessionToken: string,
  reportId: string,
  body: AdminReportViewBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/reports/${encodeURIComponent(reportId)}/view`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  const payload = await readJsonResponse<AdminReportViewResponse>(response)
  return {
    previewUrl: payload.previewUrl ? resolveMediaUrl(payload.previewUrl) : null,
  }
}

export async function applyAdminReportAction(
  sessionToken: string,
  reportId: string,
  body: AdminReportActionBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/reports/${encodeURIComponent(reportId)}/actions`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminReportDetailResponse>(response)
}

export async function fetchAdminMedia(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/media'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AdminMediaListResponse>(response)
  return {
    items: payload.items.map((item) => ({
      ...item,
      mediaUrl: resolveMediaUrl(item.mediaUrl),
    })),
  }
}

export async function fetchAdminChannels(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/channels'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AdminManagedChannelsResponse>(response)
  const channels = [...new Map(payload.channels.map((channel) => [channel.handle, channel])).values()]
  return {
    channels,
  }
}

export async function fetchAdminGroups(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/groups'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  const payload = await readJsonResponse<AdminManagedGroupsResponse>(response)
  const groups = [...new Map(payload.groups.map((group) => [group.id, group])).values()]
  return {
    groups,
  }
}

export async function fetchAdminThreads(sessionToken: string, query: string) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/threads'), window.location.origin)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminThreadsResponse>(response)
}

export async function fetchAdminDialogs(
  sessionToken: string,
  ownerIdentifier: string,
  query: string,
) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/dialogs'), window.location.origin)
  requestUrl.searchParams.set('owner', ownerIdentifier)
  requestUrl.searchParams.set('q', query)

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminDialogsResponse>(response)
}

export async function moderateAdminMedia(
  sessionToken: string,
  body: AdminMediaActionBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/admin/media/actions'),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminMediaListResponse>(response)
}

export async function fetchAdminUserAvatar(
  sessionToken: string,
  identifier: string,
  body: AdminUserAvatarBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/users/${encodeURIComponent(identifier)}/avatar`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  const payload = await readJsonResponse<AdminUserAvatarResponse>(response)
  return {
    avatarUrl: payload.avatarUrl ? resolveMediaUrl(payload.avatarUrl) : null,
  }
}

export async function downloadAdminMedia(
  sessionToken: string,
  body: AdminMediaDownloadBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/admin/media/download'),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  const payload = await readJsonResponse<AdminMediaDownloadResponse>(response)
  return {
    ...payload,
    downloadUrl: resolveMediaUrl(payload.downloadUrl),
  }
}

export async function fetchAdminAuditLog(sessionToken: string) {
  const response = await fetch(makeHttpUrl('/api/admin/audit-log'), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminAuditLogResponse>(response)
}

export async function fetchFilteredAdminAuditLog(
  sessionToken: string,
  filters: {
    actorIdentifier?: string
    from?: string
    to?: string
    targetIdentifier?: string
  },
) {
  const requestUrl = new URL(makeHttpUrl('/api/admin/audit-log'), window.location.origin)
  if (filters.actorIdentifier) {
    requestUrl.searchParams.set('actor', filters.actorIdentifier)
  }
  if (filters.from) {
    requestUrl.searchParams.set('from', filters.from)
  }
  if (filters.to) {
    requestUrl.searchParams.set('to', filters.to)
  }
  if (filters.targetIdentifier) {
    requestUrl.searchParams.set('target', filters.targetIdentifier)
  }

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  return readJsonResponse<AdminAuditLogResponse>(response)
}

export async function downloadAdminAuditCsv(
  sessionToken: string,
  body: AdminAuditCsvExportBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/admin/audit-log/export'),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminCsvExportResponse>(response)
}

export async function lookupAdminDialog(
  sessionToken: string,
  body: AdminDialogLookupBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/admin/dialogs/lookup'),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminDialogDetailResponse>(response)
}

export async function exportAdminChannelCsv(
  sessionToken: string,
  handle: string,
  body: AdminContentCsvExportBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/channels/${encodeURIComponent(handle)}/export`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminCsvExportResponse>(response)
}

export async function exportAdminGroupCsv(
  sessionToken: string,
  groupId: string,
  body: AdminContentCsvExportBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/groups/${encodeURIComponent(groupId)}/export`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminCsvExportResponse>(response)
}

export async function exportAdminThreadCsv(
  sessionToken: string,
  threadId: string,
  body: AdminContentCsvExportBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/threads/${encodeURIComponent(threadId)}/export`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminCsvExportResponse>(response)
}

export async function exportAdminDialogCsv(
  sessionToken: string,
  sharedKey: string,
  body: AdminContentCsvExportBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/admin/dialogs/${encodeURIComponent(sharedKey)}/export`),
    makeJsonRequestInit('POST', body, sessionToken),
  )

  return readJsonResponse<AdminCsvExportResponse>(response)
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
  try {
    const response = await fetch(makeHttpUrl('/api/session'), makeJsonRequestInit('PUT', body, sessionToken))
    const payload = await readJsonResponse<MutationResponse>(response)
    return normalizeMutationResponse(payload)
  } catch (error) {
    if (!isRetryableSessionUpdateFallbackError(error)) {
      throw error
    }

    const response = await fetch(makeHttpUrl('/api/session'), makeJsonRequestInit('POST', body, sessionToken))
    const payload = await readJsonResponse<MutationResponse>(response)
    return normalizeMutationResponse(payload)
  }
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

export async function registerUserGif(
  sessionToken: string,
  body: RegisterUserGifBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/session/gifs'),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function setDebugPremiumState(
  sessionToken: string,
  body: DebugPremiumBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/session/debug-premium'),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
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

export async function reportMediaAttachment(
  sessionToken: string,
  body: ReportMediaBody,
) {
  const response = await fetch(
    makeHttpUrl('/api/media/report'),
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
  const payload = await readMutationWithDeletePostFallback(
    `/api/dialogs/${dialogId}/messages/${messageId}`,
    sessionToken,
  )
  return normalizeMutationResponse(payload)
}

export async function deleteDialogHistory(sessionToken: string, dialogId: number) {
  const payload = await readMutationWithDeletePostFallback(`/api/dialogs/${dialogId}/history`, sessionToken)
  return normalizeMutationResponse(payload)
}

export async function deleteDialog(sessionToken: string, dialogId: number) {
  const payload = await readMutationWithDeletePostFallback(`/api/dialogs/${dialogId}`, sessionToken)
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
  const payload = await readMutationWithDeletePostFallback(
    `/api/groups/${groupId}/messages/${messageId}`,
    sessionToken,
  )
  return normalizeMutationResponse(payload)
}

export async function deleteManagedChannelPost(
  sessionToken: string,
  channelId: number,
  postId: number,
) {
  const payload = await readMutationWithDeletePostFallback(
    `/api/managed-channels/${channelId}/posts/${postId}`,
    sessionToken,
  )
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
  const payload = await readMutationWithDeletePostFallback(
    `/api/groups/${groupId}/messages/${messageId}/comments/${commentId}`,
    sessionToken,
  )
  return normalizeMutationResponse(payload)
}

export async function subscribeToGroupThread(
  sessionToken: string,
  groupId: number,
  messageId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}/thread-subscription`),
    makeJsonRequestInit('POST', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function unsubscribeFromGroupThread(
  sessionToken: string,
  groupId: number,
  messageId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}/thread-subscription`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function markGroupThreadRead(
  sessionToken: string,
  groupId: number,
  messageId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/groups/${groupId}/messages/${messageId}/thread-read`),
    makeJsonRequestInit('POST', undefined, sessionToken),
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
  const payload = await readMutationWithDeletePostFallback(
    `/api/subscription-channels/${channelId}/posts/${postId}/comments/${commentId}`,
    sessionToken,
  )
  return normalizeMutationResponse(payload)
}

export async function subscribeToSubscriptionChannelThread(
  sessionToken: string,
  channelId: number,
  postId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/posts/${postId}/thread-subscription`),
    makeJsonRequestInit('POST', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function unsubscribeFromSubscriptionChannelThread(
  sessionToken: string,
  channelId: number,
  postId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/posts/${postId}/thread-subscription`),
    makeJsonRequestInit('DELETE', undefined, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function markSubscriptionChannelThreadRead(
  sessionToken: string,
  channelId: number,
  postId: number,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/posts/${postId}/thread-read`),
    makeJsonRequestInit('POST', undefined, sessionToken),
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

export async function inviteManagedChannelMembers(
  sessionToken: string,
  channelId: number,
  body: InviteManagedChannelMembersBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/channels/${channelId}/invitations`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function inviteSubscriptionChannelMembers(
  sessionToken: string,
  channelId: number,
  body: InviteManagedChannelMembersBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/invitations`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function removeSubscriptionChannelSubscriber(
  sessionToken: string,
  channelId: number,
  body: ManageSubscriptionChannelSubscriberBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/subscribers/remove`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
}

export async function blacklistSubscriptionChannelSubscriber(
  sessionToken: string,
  channelId: number,
  body: ManageSubscriptionChannelSubscriberBody,
) {
  const response = await fetch(
    makeHttpUrl(`/api/subscription-channels/${channelId}/subscribers/blacklist`),
    makeJsonRequestInit('POST', body, sessionToken),
  )
  const payload = await readJsonResponse<MutationResponse>(response)
  return normalizeMutationResponse(payload)
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
