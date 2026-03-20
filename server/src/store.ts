import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { displayNameFieldMaxLength, surnameFieldMaxLength } from '../../src/app/constants'
import {
  discoveryResults,
  initialChannels,
  initialChats,
  initialGroups,
  initialSubscribedChannels,
} from '../../src/app/mockData'
import type {
  Account,
  Channel,
  Chat,
  GroupPreview,
  Message,
  Session,
  SubscriptionChannel,
} from '../../src/app/types'
import {
  formatAccountName,
  formatNowTime,
  hasActivePremium,
  makePremiumExpiry,
  normalizeIdentifier,
  normalizeNickname,
  sanitizeChannelDescription,
  sanitizeChannelTitle,
  sanitizePersonField,
  sanitizeStatusField,
} from '../../src/app/utils'
import type {
  AppSnapshot,
  CreateGroupBody,
  CreateManagedChannelBody,
  RegisterBody,
  RequestCodeResponse,
  SetDialogFavoriteBody,
  SetDialogPinnedMessageBody,
  SendDirectMessageBody,
  SendGroupMessageBody,
  UpdateManagedChannelBody,
  UpdateSessionBody,
  VerifyCodeResponse,
} from '../../src/shared/backend'

type PersistedDialog = Omit<Chat, 'messages'> & {
  ownerIdentifier: string
}

type PersistedDialogMessage = Message & {
  dialogId: number
  ownerIdentifier: string
}

type PersistedGroup = Omit<GroupPreview, 'messages'> & {
  ownerIdentifier: string
}

type PersistedGroupMessage = Message & {
  groupId: number
  ownerIdentifier: string
}

type PersistedManagedChannel = Channel & {
  ownerIdentifier: string
}

type PersistedSubscriptionChannel = Omit<SubscriptionChannel, 'posts'> & {
  ownerIdentifier: string
}

type SubscriptionPost = SubscriptionChannel['posts'][number]

type PersistedSubscriptionPost = SubscriptionPost & {
  channelId: number
  ownerIdentifier: string
}

type SessionRecord = {
  createdAt: string
  identifier: string
  token: string
}

type AuthChallenge = {
  code: string
  expiresAt: string
  identifier: string
}

type LegacyAccountState = {
  channels: Channel[]
  chats: Chat[]
  groups: GroupPreview[]
  subscriptionChannels: SubscriptionChannel[]
}

type LegacyPersistedAccount = Account & {
  state: LegacyAccountState
}

export type Database = {
  accounts: Account[]
  authChallenges: AuthChallenge[]
  dialogs: PersistedDialog[]
  dialogMessages: PersistedDialogMessage[]
  groupMessages: PersistedGroupMessage[]
  groups: PersistedGroup[]
  managedChannels: PersistedManagedChannel[]
  sessions: SessionRecord[]
  subscriptionChannels: PersistedSubscriptionChannel[]
  subscriptionPosts: PersistedSubscriptionPost[]
}

type LegacyDatabase = {
  accounts?: LegacyPersistedAccount[]
  authChallenges?: AuthChallenge[]
  sessions?: SessionRecord[]
}

type MutationResult = {
  broadcastIdentifiers: string[]
  snapshot: AppSnapshot
}

type CreateChannelResult = MutationResult & {
  channelId: number
}

type CreateGroupResult = MutationResult & {
  groupId: number
}

const AUTH_CODE_TTL_MS = 5 * 60 * 1000
const DEMO_AUTH_CODE = '1111'
export const DEFAULT_DATA_FILE = resolve(process.cwd(), 'server/data/dev-db.json')
const FALLBACK_CHAT_ACCENT = '#8c5738'
const CHAT_ACCENT_PALETTE = Array.from(new Set(initialChats.map((chat) => chat.accent)))

function cloneDiscoveryResults() {
  return structuredClone(discoveryResults)
}

function createDefaultDatabase(): Database {
  return {
    accounts: [],
    authChallenges: [],
    dialogs: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    managedChannels: [],
    sessions: [],
    subscriptionChannels: [],
    subscriptionPosts: [],
  }
}

type PersistDatabaseFn = (database: Database) => Promise<void>

function createSeedState() {
  return {
    channels: structuredClone(initialChannels),
    chats: structuredClone(initialChats),
    groups: structuredClone(initialGroups),
    subscriptionChannels: structuredClone(initialSubscribedChannels),
  }
}

function sanitizeMessageText(value: string) {
  return value.trim()
}

function sanitizeMessageAttachment(attachment: Message['attachment']) {
  if (!attachment) return undefined

  const fileName = attachment.fileName.replace(/\s+/g, ' ').trim().slice(0, 120)
  const mediaUrl = attachment.mediaUrl.trim()
  const mimeType = attachment.mimeType.trim().slice(0, 120)
  const size = Math.max(0, Math.floor(attachment.size))

  if (!fileName || !mediaUrl || !mimeType || size <= 0) {
    throw new Error('Некорректное вложение.')
  }

  return {
    fileName,
    mediaUrl,
    mimeType,
    size,
  } satisfies NonNullable<Message['attachment']>
}

function sanitizeGroupTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 48)
}

function buildGroupHandle(title: string, groupId: number) {
  const normalized = title
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18)

  return `@${normalized || `group_${groupId}`}`
}

function sanitizeGroupHandle(value: string, groupId: number) {
  const normalized = value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)

  return `@${normalized || `group_${groupId}`}`
}

function buildAccountHandle(account: Account) {
  const normalizedDigits = account.identifier.replace(/[^\d]/g, '')
  return account.nickname?.trim()
    ? `@${account.nickname.trim()}`
    : `@user_${normalizedDigits.slice(-6) || 'tinychok'}`
}

function pickAccentForIdentifier(identifier: string) {
  if (CHAT_ACCENT_PALETTE.length === 0) {
    return FALLBACK_CHAT_ACCENT
  }

  const indexSeed = identifier
    .replace(/[^\d]/g, '')
    .split('')
    .reduce((sum, digit) => sum + Number(digit), 0)

  return CHAT_ACCENT_PALETTE[indexSeed % CHAT_ACCENT_PALETTE.length] ?? FALLBACK_CHAT_ACCENT
}

function invertMessageAuthor(author: Message['author']) {
  return author === 'me' ? 'them' : 'me'
}

function toPersistedDialog(ownerIdentifier: string, chat: Chat): PersistedDialog {
  return {
    accent: chat.accent,
    handle: chat.handle,
    id: chat.id,
    lastSeen: chat.lastSeen,
    mood: chat.mood,
    online: chat.online,
    ownerIdentifier,
    phone: chat.phone,
    pinned: chat.pinned,
    pinnedMessageId: chat.pinnedMessageId,
    premium: chat.premium,
    status: chat.status,
    title: chat.title,
    typing: chat.typing,
    unread: chat.unread,
  }
}

function toPersistedDialogMessage(
  ownerIdentifier: string,
  dialogId: number,
  message: Message,
): PersistedDialogMessage {
  return {
    ...message,
    dialogId,
    ownerIdentifier,
  }
}

function toPersistedGroup(ownerIdentifier: string, group: GroupPreview): PersistedGroup {
  return {
    accent: group.accent,
    handle: group.handle,
    id: group.id,
    members: group.members,
    ownerIdentifier,
    preview: group.preview,
    time: group.time,
    title: group.title,
    unread: group.unread,
  }
}

function toPersistedGroupMessage(
  ownerIdentifier: string,
  groupId: number,
  message: Message,
): PersistedGroupMessage {
  return {
    ...message,
    groupId,
    ownerIdentifier,
  }
}

function toPersistedManagedChannel(
  ownerIdentifier: string,
  channel: Channel,
): PersistedManagedChannel {
  return {
    ...channel,
    ownerIdentifier,
  }
}

function toPersistedSubscriptionChannel(
  ownerIdentifier: string,
  channel: SubscriptionChannel,
): PersistedSubscriptionChannel {
  return {
    accent: channel.accent,
    draft: channel.draft,
    handle: channel.handle,
    id: channel.id,
    ownerIdentifier,
    preview: channel.preview,
    time: channel.time,
    title: channel.title,
    unread: channel.unread,
    visibility: channel.visibility,
  }
}

function toPersistedSubscriptionPost(
  ownerIdentifier: string,
  channelId: number,
  post: SubscriptionPost,
): PersistedSubscriptionPost {
  return {
    ...post,
    channelId,
    ownerIdentifier,
  }
}

function materializeDialog(dialog: PersistedDialog): Omit<PersistedDialog, 'ownerIdentifier'> {
  return {
    accent: dialog.accent,
    handle: dialog.handle,
    id: dialog.id,
    lastSeen: dialog.lastSeen,
    mood: dialog.mood,
    online: dialog.online,
    phone: dialog.phone,
    pinned: dialog.pinned,
    pinnedMessageId: dialog.pinnedMessageId,
    premium: dialog.premium,
    status: dialog.status,
    title: dialog.title,
    typing: dialog.typing,
    unread: dialog.unread,
  }
}

function materializeDialogMessage(
  message: PersistedDialogMessage,
): Omit<PersistedDialogMessage, 'dialogId' | 'ownerIdentifier'> {
  return {
    attachment: message.attachment,
    author: message.author,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    id: message.id,
    replyTo: message.replyTo,
    text: message.text,
    time: message.time,
  }
}

function materializeGroup(group: PersistedGroup): Omit<PersistedGroup, 'ownerIdentifier'> {
  return {
    accent: group.accent,
    handle: group.handle,
    id: group.id,
    members: group.members,
    preview: group.preview,
    time: group.time,
    title: group.title,
    unread: group.unread,
  }
}

function materializeGroupMessage(
  message: PersistedGroupMessage,
): Omit<PersistedGroupMessage, 'groupId' | 'ownerIdentifier'> {
  return {
    attachment: message.attachment,
    author: message.author,
    displayAuthor: message.displayAuthor,
    forwarded: message.forwarded,
    id: message.id,
    replyTo: message.replyTo,
    text: message.text,
    time: message.time,
  }
}

function materializeManagedChannel(
  channel: PersistedManagedChannel,
): Omit<PersistedManagedChannel, 'ownerIdentifier'> {
  return {
    avatarImage: channel.avatarImage,
    avatarTone: channel.avatarTone,
    description: channel.description,
    directLink: channel.directLink,
    id: channel.id,
    status: channel.status,
    title: channel.title,
    visibility: channel.visibility,
  }
}

function materializeSubscriptionChannel(
  channel: PersistedSubscriptionChannel,
): Omit<PersistedSubscriptionChannel, 'ownerIdentifier'> {
  return {
    accent: channel.accent,
    draft: channel.draft,
    handle: channel.handle,
    id: channel.id,
    preview: channel.preview,
    time: channel.time,
    title: channel.title,
    unread: channel.unread,
    visibility: channel.visibility,
  }
}

function materializeSubscriptionPost(
  post: PersistedSubscriptionPost,
): Omit<PersistedSubscriptionPost, 'channelId' | 'ownerIdentifier'> {
  return {
    attachment: post.attachment,
    id: post.id,
    text: post.text,
    time: post.time,
  }
}

function normalizeChats(ownerIdentifier: string, chats: Chat[]) {
  return {
    dialogMessages: chats.flatMap((chat) =>
      chat.messages.map((message) => toPersistedDialogMessage(ownerIdentifier, chat.id, message)),
    ),
    dialogs: chats.map((chat) => toPersistedDialog(ownerIdentifier, chat)),
  }
}

function normalizeGroups(ownerIdentifier: string, groups: GroupPreview[]) {
  return {
    groupMessages: groups.flatMap((group) =>
      group.messages.map((message) => toPersistedGroupMessage(ownerIdentifier, group.id, message)),
    ),
    groups: groups.map((group) => toPersistedGroup(ownerIdentifier, group)),
  }
}

function normalizeManagedChannels(ownerIdentifier: string, channels: Channel[]) {
  return channels.map((channel) => toPersistedManagedChannel(ownerIdentifier, channel))
}

function normalizeSubscriptionChannels(ownerIdentifier: string, channels: SubscriptionChannel[]) {
  return {
    subscriptionChannels: channels.map((channel) =>
      toPersistedSubscriptionChannel(ownerIdentifier, channel),
    ),
    subscriptionPosts: channels.flatMap((channel) =>
      channel.posts.map((post) =>
        toPersistedSubscriptionPost(ownerIdentifier, channel.id, post),
      ),
    ),
  }
}

function isLegacyDatabase(
  value: Partial<Database | LegacyDatabase>,
): value is LegacyDatabase {
  return Array.isArray(value.accounts) && value.accounts.some((account) => 'state' in account)
}

function migrateLegacyDatabase(value: LegacyDatabase): Database {
  const nextDatabase = createDefaultDatabase()
  nextDatabase.authChallenges = value.authChallenges ?? []
  nextDatabase.sessions = value.sessions ?? []

  for (const legacyAccount of value.accounts ?? []) {
    nextDatabase.accounts.push({
      blockedContactIds: legacyAccount.blockedContactIds ?? [],
      createdAt: legacyAccount.createdAt,
      displayName: legacyAccount.displayName,
      identifier: legacyAccount.identifier,
      nickname: legacyAccount.nickname ?? '',
      premium: legacyAccount.premium ?? true,
      premiumExpiresAt: legacyAccount.premiumExpiresAt ?? makePremiumExpiry(30),
      status: legacyAccount.status ?? '',
      surname: legacyAccount.surname ?? '',
    })

    const chats = normalizeChats(legacyAccount.identifier, legacyAccount.state.chats)
    const groups = normalizeGroups(legacyAccount.identifier, legacyAccount.state.groups)
    const managedChannels = normalizeManagedChannels(
      legacyAccount.identifier,
      legacyAccount.state.channels,
    )
    const subscriptionChannels = normalizeSubscriptionChannels(
      legacyAccount.identifier,
      legacyAccount.state.subscriptionChannels,
    )

    nextDatabase.dialogs.push(...chats.dialogs)
    nextDatabase.dialogMessages.push(...chats.dialogMessages)
    nextDatabase.groups.push(...groups.groups)
    nextDatabase.groupMessages.push(...groups.groupMessages)
    nextDatabase.managedChannels.push(...managedChannels)
    nextDatabase.subscriptionChannels.push(...subscriptionChannels.subscriptionChannels)
    nextDatabase.subscriptionPosts.push(...subscriptionChannels.subscriptionPosts)
  }

  return nextDatabase
}

function materializeChats(database: Database, ownerIdentifier: string): Chat[] {
  return database.dialogs
    .filter((dialog) => dialog.ownerIdentifier === ownerIdentifier)
    .map((dialog) => ({
      ...materializeDialog(dialog),
      messages: database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier && message.dialogId === dialog.id,
        )
        .map((message) => materializeDialogMessage(message)),
    }))
}

function materializeGroups(database: Database, ownerIdentifier: string): GroupPreview[] {
  return database.groups
    .filter((group) => group.ownerIdentifier === ownerIdentifier)
    .map((group) => ({
      ...materializeGroup(group),
      messages: database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === group.id,
        )
        .map((message) => materializeGroupMessage(message)),
    }))
}

function materializeManagedChannels(database: Database, ownerIdentifier: string): Channel[] {
  return database.managedChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .map((channel) => materializeManagedChannel(channel))
}

function materializeSubscriptionChannels(
  database: Database,
  ownerIdentifier: string,
): SubscriptionChannel[] {
  return database.subscriptionChannels
    .filter((channel) => channel.ownerIdentifier === ownerIdentifier)
    .map((channel) => ({
      ...materializeSubscriptionChannel(channel),
      posts: database.subscriptionPosts
        .filter(
          (post) => post.ownerIdentifier === ownerIdentifier && post.channelId === channel.id,
        )
        .map((post) => materializeSubscriptionPost(post)),
    }))
}

export class TinychokStore {
  private readonly persistDatabase: PersistDatabaseFn
  private database: Database

  private constructor(database: Database, persistDatabase: PersistDatabaseFn) {
    this.database = database
    this.persistDatabase = persistDatabase
  }

  static create(database: Database, persistDatabase: PersistDatabaseFn) {
    return new TinychokStore(database, persistDatabase)
  }

  static async load(dataFilePath = DEFAULT_DATA_FILE) {
    const { database, needsPersistenceRewrite } = await loadDatabaseFromFile(dataFilePath)
    const store = new TinychokStore(database, async (nextDatabase) =>
      persistDatabaseToFile(dataFilePath, nextDatabase),
    )

    if (needsPersistenceRewrite) {
      await store.persist()
    }

    return store
  }

  async requestCode(identifier: string): Promise<RequestCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)

    if (!normalizedIdentifier || normalizedIdentifier.length < 12) {
      throw new Error('Проверь номер телефона.')
    }

    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString()
    const existingAccount = this.findAccount(normalizedIdentifier)

    this.database.authChallenges = this.database.authChallenges
      .filter((challenge) => challenge.identifier !== normalizedIdentifier)
      .concat({
        code: DEMO_AUTH_CODE,
        expiresAt,
        identifier: normalizedIdentifier,
      })

    await this.persist()
    console.info(`[tinychok-server] demo code for ${normalizedIdentifier}: ${DEMO_AUTH_CODE}`)

    return {
      delivery: 'sms',
      existingAccount: existingAccount
        ? {
            displayName: existingAccount.displayName,
            surname: existingAccount.surname ?? '',
          }
        : null,
      expiresAt,
    }
  }

  async verifyCode(identifier: string, code: string): Promise<VerifyCodeResponse> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    this.assertValidChallenge(normalizedIdentifier, code)

    const existingAccount = this.findAccount(normalizedIdentifier)
    if (!existingAccount) {
      return {
        existingAccount: null,
        status: 'needs-profile',
      }
    }

    const token = await this.createSessionToken(normalizedIdentifier)
    this.clearChallenge(normalizedIdentifier)
    await this.persist()

    return {
      snapshot: this.buildSnapshot(existingAccount, token),
      status: 'authenticated',
    }
  }

  async registerAccount(payload: RegisterBody): Promise<AppSnapshot> {
    const normalizedIdentifier = normalizeIdentifier(payload.identifier)
    this.assertValidChallenge(normalizedIdentifier, payload.code)

    if (this.findAccount(normalizedIdentifier)) {
      throw new Error('Аккаунт уже существует. Попробуйте войти.')
    }

    const displayName = sanitizePersonField(payload.displayName, displayNameFieldMaxLength)
    if (!displayName) {
      throw new Error('Для регистрации нужен ник или имя.')
    }

    const nextAccount: Account = {
      blockedContactIds: [],
      createdAt: new Date().toISOString(),
      displayName,
      identifier: normalizedIdentifier,
      nickname: '',
      premium: true,
      premiumExpiresAt: makePremiumExpiry(30),
      status: '',
      surname: '',
    }

    this.database.accounts.push(nextAccount)
    this.replaceOwnerState(normalizedIdentifier, createSeedState())
    const token = await this.createSessionToken(normalizedIdentifier)
    this.clearChallenge(normalizedIdentifier)
    await this.persist()

    return this.buildSnapshot(nextAccount, token)
  }

  getSnapshotByToken(token: string) {
    const account = this.findAccountByToken(token)
    return account ? this.buildSnapshot(account, token) : null
  }

  getIdentifierByToken(token: string) {
    return this.database.sessions.find((session) => session.token === token)?.identifier ?? null
  }

  listTokensByIdentifier(identifier: string) {
    return this.database.sessions
      .filter((session) => session.identifier === identifier)
      .map((session) => session.token)
  }

  async saveSnapshot(token: string, snapshot: AppSnapshot) {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    account.displayName = sanitizePersonField(snapshot.session.displayName, displayNameFieldMaxLength)
    account.surname = sanitizePersonField(snapshot.session.surname ?? '', surnameFieldMaxLength)
    account.nickname = normalizeNickname(snapshot.session.nickname ?? '')
    account.status = sanitizeStatusField(snapshot.session.status ?? '')
    account.blockedContactIds = [...(snapshot.session.blockedContactIds ?? [])]
    account.premium = snapshot.session.premium ?? true
    account.premiumExpiresAt = snapshot.session.premiumExpiresAt ?? account.premiumExpiresAt

    this.replaceOwnerState(account.identifier, {
      channels: snapshot.channels,
      chats: snapshot.chats,
      groups: snapshot.groups,
      subscriptionChannels: snapshot.subscriptionChannels,
    })

    await this.persist()
    return this.buildSnapshot(account, token)
  }

  async updateSession(token: string, payload: UpdateSessionBody): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    if (payload.displayName !== undefined) {
      const nextDisplayName = sanitizePersonField(payload.displayName, displayNameFieldMaxLength)
      if (!nextDisplayName) {
        throw new Error('Имя не может быть пустым.')
      }
      account.displayName = nextDisplayName
    }

    if (payload.surname !== undefined) {
      account.surname = sanitizePersonField(payload.surname, surnameFieldMaxLength)
    }

    if (payload.nickname !== undefined) {
      account.nickname = normalizeNickname(payload.nickname)
    }

    if (payload.status !== undefined) {
      account.status = sanitizeStatusField(payload.status)
    }

    if (payload.blockedContactIds !== undefined) {
      account.blockedContactIds = [...new Set(
        payload.blockedContactIds.filter((id) => Number.isInteger(id) && id > 0),
      )]
    }

    const broadcastIdentifiers = this.refreshDialogsForAccount(account)
    broadcastIdentifiers.push(account.identifier)

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendDirectMessage(
    token: string,
    dialogId: number,
    payload: SendDirectMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const text = sanitizeMessageText(payload.text)
    const attachment = sanitizeMessageAttachment(payload.attachment)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const senderReplyTo: Message['replyTo'] = payload.replyTo
      ? {
          author: payload.replyTo.author,
          text: sanitizeMessageText(payload.replyTo.text).slice(0, 280),
        }
      : undefined
    const time = formatNowTime()
    const recipientIdentifier = normalizeIdentifier(dialog.phone)
    const recipientAccount =
      recipientIdentifier && recipientIdentifier !== account.identifier
        ? this.findAccount(recipientIdentifier)
        : null

    if (recipientAccount) {
      this.syncDialogContactProfile(dialog, recipientAccount)
    }

    this.database.dialogMessages.push({
      attachment,
      author: 'me',
      dialogId: dialog.id,
      forwarded: payload.forwarded,
      id: this.getNextDialogMessageId(account.identifier, dialog.id),
      ownerIdentifier: account.identifier,
      replyTo: senderReplyTo,
      text,
      time,
    })

    dialog.typing = false
    dialog.unread = payload.markAsRead === false ? dialog.unread : 0
    dialog.status = 'только что был(а) здесь'

    const broadcastIdentifiers = [account.identifier]

    if (recipientAccount) {
      const recipientDialog = this.ensureDialogForContact(recipientAccount.identifier, account)
      const recipientReplyTo: Message['replyTo'] = senderReplyTo
        ? {
            author: invertMessageAuthor(senderReplyTo.author),
            text: senderReplyTo.text,
          }
        : undefined

      // Messages carry only attachment metadata and a stable media URL.
      // The file itself is already stored by the dedicated media upload endpoint.
      this.database.dialogMessages.push({
        attachment,
        author: 'them',
        dialogId: recipientDialog.id,
        forwarded: payload.forwarded,
        id: this.getNextDialogMessageId(recipientAccount.identifier, recipientDialog.id),
        ownerIdentifier: recipientAccount.identifier,
        replyTo: recipientReplyTo,
        text,
        time,
      })

      recipientDialog.typing = false
      recipientDialog.unread += 1
      this.syncDialogContactProfile(recipientDialog, account)
      broadcastIdentifiers.push(recipientAccount.identifier)
    }

    await this.persist()

    return {
      broadcastIdentifiers: [...new Set(broadcastIdentifiers)],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDialogFavorite(
    token: string,
    dialogId: number,
    payload: SetDialogFavoriteBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    dialog.pinned = payload.pinned
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async setDialogPinnedMessage(
    token: string,
    dialogId: number,
    payload: SetDialogPinnedMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    if (payload.messageId === null) {
      dialog.pinnedMessageId = undefined
    } else {
      const hasMessage = this.database.dialogMessages.some(
        (message) =>
          message.ownerIdentifier === account.identifier &&
          message.dialogId === dialogId &&
          message.id === payload.messageId,
      )

      if (!hasMessage) {
        throw new Error('Сообщение не найдено.')
      }

      dialog.pinnedMessageId = payload.messageId
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialogMessage(
    token: string,
    dialogId: number,
    messageId: number,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    const beforeCount = this.database.dialogMessages.length
    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) =>
        !(
          message.ownerIdentifier === account.identifier &&
          message.dialogId === dialogId &&
          message.id === messageId
        ),
    )

    if (this.database.dialogMessages.length === beforeCount) {
      throw new Error('Сообщение не найдено.')
    }

    if (dialog.pinnedMessageId === messageId) {
      dialog.pinnedMessageId = undefined
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialogHistory(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    dialog.pinnedMessageId = undefined
    dialog.typing = false
    dialog.unread = 0

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteDialog(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const hasDialog = this.database.dialogs.some(
      (dialog) => dialog.ownerIdentifier === account.identifier && dialog.id === dialogId,
    )
    if (!hasDialog) {
      throw new Error('Диалог не найден.')
    }

    this.database.dialogs = this.database.dialogs.filter(
      (dialog) => !(dialog.ownerIdentifier === account.identifier && dialog.id === dialogId),
    )
    this.database.dialogMessages = this.database.dialogMessages.filter(
      (message) => !(message.ownerIdentifier === account.identifier && message.dialogId === dialogId),
    )
    account.blockedContactIds = (account.blockedContactIds ?? []).filter((id) => id !== dialogId)

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async sendGroupMessage(
    token: string,
    groupId: number,
    payload: SendGroupMessageBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    const text = sanitizeMessageText(payload.text)
    const attachment = sanitizeMessageAttachment(payload.attachment)
    if (!text && !attachment) {
      throw new Error('Нельзя отправить пустое сообщение.')
    }

    const time = formatNowTime()

    this.database.groupMessages.push({
      attachment,
      author: 'me',
      groupId,
      id: this.getNextGroupMessageId(account.identifier, groupId),
      ownerIdentifier: account.identifier,
      text,
      time,
    })

    group.preview = text || (attachment ? `Файл: ${attachment.fileName}` : group.preview)
    group.time = time
    group.unread = 0

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markDialogRead(token: string, dialogId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const dialog = this.findDialog(account.identifier, dialogId)
    if (!dialog) {
      throw new Error('Диалог не найден.')
    }

    dialog.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markGroupRead(token: string, groupId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const group = this.findGroup(account.identifier, groupId)
    if (!group) {
      throw new Error('Группа не найдена.')
    }

    group.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async markSubscriptionChannelRead(token: string, channelId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findSubscriptionChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    channel.unread = 0
    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async createManagedChannel(
    token: string,
    payload: CreateManagedChannelBody,
  ): Promise<CreateChannelResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channelId = this.getNextOwnedId(this.database.managedChannels, account.identifier)
    const channelNumber = this.database.managedChannels.filter(
      (channel) => channel.ownerIdentifier === account.identifier,
    ).length + 1
    const title = sanitizeChannelTitle(payload.title) || `Новый канал ${channelNumber}`
    const directLink = payload.directLink.trim() || `https://tinychok.app/c/draft-${channelId}`
    const description =
      sanitizeChannelDescription(payload.description) ||
      'Описание канала пока не заполнено. Здесь можно подготовить текст до публикации.'
    const visibility =
      payload.visibility === 'public' || payload.visibility === 'closed'
        ? payload.visibility
        : 'private'

    this.database.managedChannels.push({
      avatarTone: payload.avatarTone.trim() || pickAccentForIdentifier(`${account.identifier}${channelId}`),
      description,
      directLink,
      id: channelId,
      ownerIdentifier: account.identifier,
      status: 'draft',
      title,
      visibility,
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      channelId,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async updateManagedChannel(
    token: string,
    channelId: number,
    payload: UpdateManagedChannelBody,
  ): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const channel = this.findManagedChannel(account.identifier, channelId)
    if (!channel) {
      throw new Error('Канал не найден.')
    }

    if (payload.title !== undefined) {
      const nextTitle = sanitizeChannelTitle(payload.title)
      if (!nextTitle) {
        throw new Error('Название канала не может быть пустым.')
      }
      channel.title = nextTitle
    }

    if (payload.directLink !== undefined) {
      channel.directLink = payload.directLink.trim() || channel.directLink
    }

    if (payload.description !== undefined) {
      channel.description =
        sanitizeChannelDescription(payload.description) || channel.description
    }

    if (payload.visibility !== undefined) {
      channel.visibility =
        payload.visibility === 'public' || payload.visibility === 'closed'
          ? payload.visibility
          : 'private'
    }

    if (payload.avatarTone !== undefined && payload.avatarTone.trim()) {
      channel.avatarTone = payload.avatarTone.trim()
    }

    if (payload.avatarImage !== undefined) {
      channel.avatarImage = payload.avatarImage.trim() || undefined
    }

    if (payload.status !== undefined) {
      channel.status = payload.status === 'active' ? 'active' : 'draft'
    }

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async deleteManagedChannel(token: string, channelId: number): Promise<MutationResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const hasChannel = this.database.managedChannels.some(
      (channel) => channel.ownerIdentifier === account.identifier && channel.id === channelId,
    )
    if (!hasChannel) {
      throw new Error('Канал не найден.')
    }

    this.database.managedChannels = this.database.managedChannels.filter(
      (channel) => !(channel.ownerIdentifier === account.identifier && channel.id === channelId),
    )

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      snapshot: this.buildSnapshot(account, token),
    }
  }

  async createGroup(token: string, payload: CreateGroupBody): Promise<CreateGroupResult> {
    const account = this.findAccountByToken(token)
    if (!account) {
      throw new Error('Сессия не найдена.')
    }

    const groupId = this.getNextOwnedId(this.database.groups, account.identifier)
    const groupNumber = this.database.groups.filter(
      (group) => group.ownerIdentifier === account.identifier,
    ).length + 1
    const title = sanitizeGroupTitle(payload.title) || `Новая группа ${groupNumber}`

    this.database.groups.push({
      accent: payload.accent?.trim() || pickAccentForIdentifier(`${account.identifier}${groupId}`),
      handle: payload.handle?.trim()
        ? sanitizeGroupHandle(payload.handle, groupId)
        : buildGroupHandle(title, groupId),
      id: groupId,
      members: 1,
      ownerIdentifier: account.identifier,
      preview: 'Новая группа готова. Можно начинать обсуждение.',
      time: formatNowTime(),
      title,
      unread: 0,
    })

    await this.persist()

    return {
      broadcastIdentifiers: [account.identifier],
      groupId,
      snapshot: this.buildSnapshot(account, token),
    }
  }

  private assertValidChallenge(identifier: string, code: string) {
    const challenge = this.database.authChallenges.find((item) => item.identifier === identifier)

    if (!challenge) {
      throw new Error('Сначала запросите код подтверждения.')
    }

    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      this.clearChallenge(identifier)
      throw new Error('Код истёк. Запросите новый.')
    }

    if (challenge.code !== code.trim()) {
      throw new Error('Неверный код из SMS.')
    }
  }

  private buildSnapshot(account: Account, token: string): AppSnapshot {
    return {
      channels: materializeManagedChannels(this.database, account.identifier),
      chats: materializeChats(this.database, account.identifier),
      discoveryResults: cloneDiscoveryResults(),
      groups: materializeGroups(this.database, account.identifier),
      session: {
        blockedContactIds: [...(account.blockedContactIds ?? [])],
        displayName: account.displayName,
        identifier: account.identifier,
        nickname: account.nickname ?? '',
        premium: account.premium ?? true,
        premiumExpiresAt: account.premiumExpiresAt ?? '',
        sessionToken: token,
        status: account.status ?? '',
        surname: account.surname ?? '',
      } satisfies Session,
      subscriptionChannels: materializeSubscriptionChannels(this.database, account.identifier),
    }
  }

  private clearChallenge(identifier: string) {
    this.database.authChallenges = this.database.authChallenges.filter(
      (challenge) => challenge.identifier !== identifier,
    )
  }

  private async createSessionToken(identifier: string) {
    const token = randomUUID()
    this.database.sessions.push({
      createdAt: new Date().toISOString(),
      identifier,
      token,
    })
    return token
  }

  private findAccount(identifier: string) {
    return this.database.accounts.find((account) => account.identifier === identifier) ?? null
  }

  private findAccountByToken(token: string) {
    const identifier = this.getIdentifierByToken(token)
    return identifier ? this.findAccount(identifier) : null
  }

  private hasActiveSession(identifier: string) {
    return this.database.sessions.some((session) => session.identifier === identifier)
  }

  private getNextOwnedId<T extends { id: number; ownerIdentifier: string }>(
    records: T[],
    ownerIdentifier: string,
  ) {
    return (
      records
        .filter((record) => record.ownerIdentifier === ownerIdentifier)
        .reduce((maxId, record) => Math.max(maxId, record.id), 0) + 1
    )
  }

  private getNextDialogMessageId(ownerIdentifier: string, dialogId: number) {
    return (
      this.database.dialogMessages
        .filter(
          (message) =>
            message.ownerIdentifier === ownerIdentifier && message.dialogId === dialogId,
        )
        .reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1
    )
  }

  private getNextGroupMessageId(ownerIdentifier: string, groupId: number) {
    return (
      this.database.groupMessages
        .filter(
          (message) => message.ownerIdentifier === ownerIdentifier && message.groupId === groupId,
        )
        .reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1
    )
  }

  private findDialog(ownerIdentifier: string, dialogId: number) {
    return (
      this.database.dialogs.find(
        (dialog) => dialog.ownerIdentifier === ownerIdentifier && dialog.id === dialogId,
      ) ?? null
    )
  }

  private findGroup(ownerIdentifier: string, groupId: number) {
    return (
      this.database.groups.find(
        (group) => group.ownerIdentifier === ownerIdentifier && group.id === groupId,
      ) ?? null
    )
  }

  private findSubscriptionChannel(ownerIdentifier: string, channelId: number) {
    return (
      this.database.subscriptionChannels.find(
        (channel) => channel.ownerIdentifier === ownerIdentifier && channel.id === channelId,
      ) ?? null
    )
  }

  private findManagedChannel(ownerIdentifier: string, channelId: number) {
    return (
      this.database.managedChannels.find(
        (channel) => channel.ownerIdentifier === ownerIdentifier && channel.id === channelId,
      ) ?? null
    )
  }

  private refreshDialogsForAccount(account: Account) {
    const affectedOwners = new Set<string>()

    for (const dialog of this.database.dialogs) {
      if (normalizeIdentifier(dialog.phone) !== account.identifier) continue

      this.syncDialogContactProfile(dialog, account)
      affectedOwners.add(dialog.ownerIdentifier)
    }

    return [...affectedOwners]
  }

  private syncDialogContactProfile(dialog: PersistedDialog, account: Account) {
    const online = this.hasActiveSession(account.identifier)

    dialog.title = formatAccountName(account) || account.identifier
    dialog.handle = buildAccountHandle(account)
    dialog.phone = account.identifier
    dialog.accent = pickAccentForIdentifier(account.identifier)
    dialog.mood = account.status?.trim() || 'На связи'
    dialog.status = account.status?.trim() || (online ? 'в сети' : 'был(а) недавно в сети')
    dialog.online = online
    dialog.lastSeen = online ? undefined : 'был(а) недавно в сети'
    dialog.premium = hasActivePremium(account.premium, account.premiumExpiresAt)
  }

  private ensureDialogForContact(ownerIdentifier: string, contactAccount: Account) {
    const existingDialog = this.database.dialogs.find(
      (dialog) =>
        dialog.ownerIdentifier === ownerIdentifier && dialog.phone === contactAccount.identifier,
    )

    if (existingDialog) {
      this.syncDialogContactProfile(existingDialog, contactAccount)
      return existingDialog
    }

    const nextDialog: PersistedDialog = {
      accent: pickAccentForIdentifier(contactAccount.identifier),
      handle: buildAccountHandle(contactAccount),
      id: this.getNextOwnedId(this.database.dialogs, ownerIdentifier),
      lastSeen: undefined,
      mood: contactAccount.status?.trim() || 'На связи',
      online: this.hasActiveSession(contactAccount.identifier),
      ownerIdentifier,
      phone: contactAccount.identifier,
      pinned: false,
      premium: hasActivePremium(contactAccount.premium, contactAccount.premiumExpiresAt),
      status: contactAccount.status?.trim() || 'в сети',
      title: formatAccountName(contactAccount) || contactAccount.identifier,
      typing: false,
      unread: 0,
    }

    this.syncDialogContactProfile(nextDialog, contactAccount)
    this.database.dialogs.push(nextDialog)
    return nextDialog
  }

  private replaceOwnerState(
    ownerIdentifier: string,
    state: {
      channels: Channel[]
      chats: Chat[]
      groups: GroupPreview[]
      subscriptionChannels: SubscriptionChannel[]
    },
  ) {
    const dialogs = normalizeChats(ownerIdentifier, state.chats)
    const groups = normalizeGroups(ownerIdentifier, state.groups)
    const managedChannels = normalizeManagedChannels(ownerIdentifier, state.channels)
    const subscriptionChannels = normalizeSubscriptionChannels(
      ownerIdentifier,
      state.subscriptionChannels,
    )

    this.database.dialogs = this.database.dialogs
      .filter((dialog) => dialog.ownerIdentifier !== ownerIdentifier)
      .concat(dialogs.dialogs)
    this.database.dialogMessages = this.database.dialogMessages
      .filter((message) => message.ownerIdentifier !== ownerIdentifier)
      .concat(dialogs.dialogMessages)
    this.database.groups = this.database.groups
      .filter((group) => group.ownerIdentifier !== ownerIdentifier)
      .concat(groups.groups)
    this.database.groupMessages = this.database.groupMessages
      .filter((message) => message.ownerIdentifier !== ownerIdentifier)
      .concat(groups.groupMessages)
    this.database.managedChannels = this.database.managedChannels
      .filter((channel) => channel.ownerIdentifier !== ownerIdentifier)
      .concat(managedChannels)
    this.database.subscriptionChannels = this.database.subscriptionChannels
      .filter((channel) => channel.ownerIdentifier !== ownerIdentifier)
      .concat(subscriptionChannels.subscriptionChannels)
    this.database.subscriptionPosts = this.database.subscriptionPosts
      .filter((post) => post.ownerIdentifier !== ownerIdentifier)
      .concat(subscriptionChannels.subscriptionPosts)
  }

  private async persist() {
    await this.persistDatabase(this.database)
  }
}

function normalizeDatabasePayload(parsed: Partial<Database | LegacyDatabase>) {
  if (isLegacyDatabase(parsed)) {
    return {
      database: migrateLegacyDatabase(parsed),
      needsPersistenceRewrite: true,
    }
  }

  const normalized = parsed as Partial<Database>
  return {
    database: {
      ...createDefaultDatabase(),
      ...normalized,
      accounts: normalized.accounts ?? [],
      authChallenges: normalized.authChallenges ?? [],
      dialogs: normalized.dialogs ?? [],
      dialogMessages: normalized.dialogMessages ?? [],
      groupMessages: normalized.groupMessages ?? [],
      groups: normalized.groups ?? [],
      managedChannels: normalized.managedChannels ?? [],
      sessions: normalized.sessions ?? [],
      subscriptionChannels: normalized.subscriptionChannels ?? [],
      subscriptionPosts: normalized.subscriptionPosts ?? [],
    } satisfies Database,
    needsPersistenceRewrite: false,
  }
}

export function coerceDatabasePayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {
      database: createDefaultDatabase(),
      needsPersistenceRewrite: false,
    }
  }

  return normalizeDatabasePayload(value as Partial<Database | LegacyDatabase>)
}

export async function loadDatabaseFromFile(dataFilePath = DEFAULT_DATA_FILE) {
  try {
    const raw = await readFile(dataFilePath, 'utf8')
    return coerceDatabasePayload(JSON.parse(raw) as Partial<Database | LegacyDatabase>)
  } catch {
    return {
      database: createDefaultDatabase(),
      needsPersistenceRewrite: false,
    }
  }
}

export async function persistDatabaseToFile(dataFilePath: string, database: Database) {
  await mkdir(dirname(dataFilePath), { recursive: true })
  await writeFile(dataFilePath, JSON.stringify(database, null, 2))
}
