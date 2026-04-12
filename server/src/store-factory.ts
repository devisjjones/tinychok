import { Pool, type PoolClient } from 'pg'
import { runtimeConfig } from './config'
import type { AppStore, StoreMetadata } from './store-contract'
import { coerceDatabasePayload, loadDatabaseFromFile, TinychokStore, type Database } from './store'

type PersistedAccountStatusHistory = {
  entries: NonNullable<Database['accounts'][number]['statusHistory']>
  identifier: string
}

type HybridCollectionName =
  | 'dialogMessages'
  | 'groupMessages'
  | 'groups'
  | 'subscriptionChannels'
  | 'subscriptionPosts'
  | 'supportTickets'
  | 'threadStates'
  | 'ipAccessLogs'
  | 'adminAuditLogs'
  | 'archivedMedia'
  | 'pendingGroupInvitations'
  | 'pendingChannelInvitations'
  | 'pendingMediaUploads'
  | 'accountStatusHistories'

type HybridCollectionPayloads = {
  dialogMessages: Database['dialogMessages']
  groupMessages: Database['groupMessages']
  groups: Database['groups']
  subscriptionChannels: Database['subscriptionChannels']
  subscriptionPosts: Database['subscriptionPosts']
  supportTickets: Database['supportTickets']
  threadStates: Database['threadStates']
  ipAccessLogs: Database['ipAccessLogs']
  adminAuditLogs: Database['adminAuditLogs']
  archivedMedia: Database['archivedMedia']
  pendingGroupInvitations: Database['pendingGroupInvitations']
  pendingChannelInvitations: Database['pendingChannelInvitations']
  pendingMediaUploads: Database['pendingMediaUploads']
  accountStatusHistories: PersistedAccountStatusHistory[]
}

type HybridCollectionRowPresence = {
  [Key in HybridCollectionName]: boolean
}

type LoadedHybridCollections = {
  collections: HybridCollectionPayloads
  rowPresence: HybridCollectionRowPresence
}

type HybridPersistenceCache = {
  collections: {
    [Key in HybridCollectionName]: Map<string, string>
  }
  slimPayloadJson: string | null
}

type HybridTableDefinition<Name extends HybridCollectionName> = {
  buildDeleteQuery: (tableName: string) => string
  buildInsertQuery: (tableName: string) => string
  buildKeyParts: (item: HybridCollectionPayloads[Name][number]) => readonly unknown[]
  createTableSql: (tableName: string) => string
  loadOrderBy: string
  name: Name
  tableSuffix: string
}

const HYBRID_COLLECTION_DEFINITIONS: {
  [Key in HybridCollectionName]: HybridTableDefinition<Key>
} = {
  dialogMessages: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and dialog_id = $2 and message_id = $3`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, dialog_id, message_id, payload, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (owner_identifier, dialog_id, message_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.dialogId, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        dialog_id bigint not null,
        message_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, dialog_id, message_id)
      )
    `,
    loadOrderBy: 'owner_identifier, dialog_id, message_id',
    name: 'dialogMessages',
    tableSuffix: 'dialog_messages',
  },
  groupMessages: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and group_id = $2 and message_id = $3`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, group_id, message_id, payload, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (owner_identifier, group_id, message_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.groupId, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        group_id bigint not null,
        message_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, group_id, message_id)
      )
    `,
    loadOrderBy: 'owner_identifier, group_id, message_id',
    name: 'groupMessages',
    tableSuffix: 'group_messages',
  },
  groups: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and group_id = $2`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, group_id, payload, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_identifier, group_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        group_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, group_id)
      )
    `,
    loadOrderBy: 'owner_identifier, group_id',
    name: 'groups',
    tableSuffix: 'groups',
  },
  subscriptionChannels: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and channel_id = $2`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, channel_id, payload, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_identifier, channel_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        channel_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, channel_id)
      )
    `,
    loadOrderBy: 'owner_identifier, channel_id',
    name: 'subscriptionChannels',
    tableSuffix: 'subscription_channels',
  },
  subscriptionPosts: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and channel_id = $2 and post_id = $3`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, channel_id, post_id, payload, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (owner_identifier, channel_id, post_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.channelId, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        channel_id bigint not null,
        post_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, channel_id, post_id)
      )
    `,
    loadOrderBy: 'owner_identifier, channel_id, post_id',
    name: 'subscriptionPosts',
    tableSuffix: 'subscription_posts',
  },
  supportTickets: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and ticket_id = $2`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, ticket_id, payload, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_identifier, ticket_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        ticket_id bigint not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, ticket_id)
      )
    `,
    loadOrderBy: 'owner_identifier, ticket_id',
    name: 'supportTickets',
    tableSuffix: 'support_tickets',
  },
  threadStates: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where owner_identifier = $1 and thread_id = $2`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (owner_identifier, thread_id, payload, updated_at)
      values ($1, $2, $3::jsonb, now())
      on conflict (owner_identifier, thread_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.ownerIdentifier, item.threadId],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        owner_identifier text not null,
        thread_id text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (owner_identifier, thread_id)
      )
    `,
    loadOrderBy: 'owner_identifier, thread_id',
    name: 'threadStates',
    tableSuffix: 'thread_states',
  },
  ipAccessLogs: {
    buildDeleteQuery: (tableName) => `delete from ${tableName} where log_id = $1`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (log_id, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (log_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        log_id text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (log_id)
      )
    `,
    loadOrderBy: 'log_id',
    name: 'ipAccessLogs',
    tableSuffix: 'ip_access_logs',
  },
  adminAuditLogs: {
    buildDeleteQuery: (tableName) => `delete from ${tableName} where audit_id = $1`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (audit_id, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (audit_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        audit_id text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (audit_id)
      )
    `,
    loadOrderBy: 'audit_id',
    name: 'adminAuditLogs',
    tableSuffix: 'admin_audit_logs',
  },
  archivedMedia: {
    buildDeleteQuery: (tableName) => `delete from ${tableName} where media_id = $1`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (media_id, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (media_id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.id],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        media_id text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (media_id)
      )
    `,
    loadOrderBy: 'media_id',
    name: 'archivedMedia',
    tableSuffix: 'archived_media',
  },
  pendingGroupInvitations: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where recipient_identifier = $1 and shared_id = $2 and sender_identifier = $3`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (recipient_identifier, shared_id, sender_identifier, payload, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (recipient_identifier, shared_id, sender_identifier) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.recipientIdentifier, item.sharedId, item.senderIdentifier],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        recipient_identifier text not null,
        shared_id text not null,
        sender_identifier text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (recipient_identifier, shared_id, sender_identifier)
      )
    `,
    loadOrderBy: 'recipient_identifier, shared_id, sender_identifier',
    name: 'pendingGroupInvitations',
    tableSuffix: 'pending_group_invitations',
  },
  pendingChannelInvitations: {
    buildDeleteQuery: (tableName) =>
      `delete from ${tableName} where recipient_identifier = $1 and channel_handle = $2 and sender_identifier = $3`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (recipient_identifier, channel_handle, sender_identifier, payload, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (recipient_identifier, channel_handle, sender_identifier) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.recipientIdentifier, item.channelHandle, item.senderIdentifier],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        recipient_identifier text not null,
        channel_handle text not null,
        sender_identifier text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (recipient_identifier, channel_handle, sender_identifier)
      )
    `,
    loadOrderBy: 'recipient_identifier, channel_handle, sender_identifier',
    name: 'pendingChannelInvitations',
    tableSuffix: 'pending_channel_invitations',
  },
  pendingMediaUploads: {
    buildDeleteQuery: (tableName) => `delete from ${tableName} where storage_key = $1`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (storage_key, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (storage_key) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.storageKey],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        storage_key text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (storage_key)
      )
    `,
    loadOrderBy: 'storage_key',
    name: 'pendingMediaUploads',
    tableSuffix: 'pending_media_uploads',
  },
  accountStatusHistories: {
    buildDeleteQuery: (tableName) => `delete from ${tableName} where identifier = $1`,
    buildInsertQuery: (tableName) => `
      insert into ${tableName} (identifier, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (identifier) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    buildKeyParts: (item) => [item.identifier],
    createTableSql: (tableName) => `
      create table if not exists ${tableName} (
        identifier text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (identifier)
      )
    `,
    loadOrderBy: 'identifier',
    name: 'accountStatusHistories',
    tableSuffix: 'account_status_histories',
  },
}

const HYBRID_COLLECTION_NAMES = [
  'dialogMessages',
  'groupMessages',
  'groups',
  'subscriptionChannels',
  'subscriptionPosts',
  'supportTickets',
  'threadStates',
  'ipAccessLogs',
  'adminAuditLogs',
  'archivedMedia',
  'pendingGroupInvitations',
  'pendingChannelInvitations',
  'pendingMediaUploads',
  'accountStatusHistories',
] as const satisfies readonly HybridCollectionName[]

function assertSafeIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error('Некорректное имя PostgreSQL таблицы для state store.')
  }

  return value
}

function getHybridTableName(stateTableName: string, suffix: string) {
  return assertSafeIdentifier(`${stateTableName}_${suffix}`)
}

function buildHybridCollectionKey<Name extends HybridCollectionName>(
  definition: HybridTableDefinition<Name>,
  item: HybridCollectionPayloads[Name][number],
) {
  return JSON.stringify(definition.buildKeyParts(item))
}

function getHybridCollectionDefinition<Name extends HybridCollectionName>(name: Name) {
  return HYBRID_COLLECTION_DEFINITIONS[name]
}

function setHybridCollection<Name extends HybridCollectionName>(
  collections: HybridCollectionPayloads,
  name: Name,
  items: HybridCollectionPayloads[Name],
) {
  collections[name] = items
}

function parseHybridCollectionKey(key: string) {
  const parsed = JSON.parse(key)
  if (!Array.isArray(parsed)) {
    throw new Error('Некорректный hybrid storage key.')
  }

  return parsed as unknown[]
}

function stripAccountStatusHistoriesFromAccounts(database: Database): Database['accounts'] {
  return database.accounts.map((account) => {
    if (account.statusHistory === undefined) {
      return account
    }

    const rest = { ...account }
    delete rest.statusHistory
    return rest
  })
}

function buildAccountStatusHistoriesSnapshot(database: Database): PersistedAccountStatusHistory[] {
  return database.accounts
    .filter((account) => Array.isArray(account.statusHistory) && account.statusHistory.length > 0)
    .map((account) => ({
      entries: account.statusHistory ?? [],
      identifier: account.identifier,
    }))
    .sort((left, right) => left.identifier.localeCompare(right.identifier))
}

function hydrateAccountsWithStatusHistories(
  accounts: Database['accounts'],
  histories: PersistedAccountStatusHistory[],
): Database['accounts'] {
  const historyByIdentifier = new Map(histories.map((entry) => [entry.identifier, entry.entries]))

  return accounts.map((account) => {
    const statusHistory = historyByIdentifier.get(account.identifier)
    if (statusHistory && statusHistory.length > 0) {
      return {
        ...account,
        statusHistory,
      }
    }
    if (account.statusHistory === undefined) {
      return account
    }
    const rest = { ...account }
    delete rest.statusHistory
    return rest
  })
}

function hasNonEmptyState(database: Awaited<ReturnType<typeof loadDatabaseFromFile>>['database']) {
  return (
    database.accounts.length > 0 ||
    database.dialogs.length > 0 ||
    database.groups.length > 0 ||
    database.managedChannels.length > 0 ||
    database.sessions.length > 0
  )
}

function createPostgresPool() {
  const postgresConfig = runtimeConfig.storage.postgres

  return new Pool(
    postgresConfig.connectionString
      ? {
          connectionString: postgresConfig.connectionString,
          ssl: postgresConfig.ssl ? { rejectUnauthorized: false } : undefined,
        }
      : {
          database: postgresConfig.database,
          host: postgresConfig.host,
          password: postgresConfig.password,
          port: postgresConfig.port,
          ssl: postgresConfig.ssl ? { rejectUnauthorized: false } : undefined,
          user: postgresConfig.user,
        },
  )
}

export function stripHybridCollectionsFromDatabase(database: Database): Database {
  return {
    ...database,
    accounts: stripAccountStatusHistoriesFromAccounts(database),
    adminAuditLogs: [],
    archivedMedia: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    ipAccessLogs: [],
    pendingChannelInvitations: [],
    pendingGroupInvitations: [],
    pendingMediaUploads: [],
    subscriptionChannels: [],
    subscriptionPosts: [],
    supportTickets: [],
    threadStates: [],
  }
}

export function buildHybridCollectionsSnapshot(database: Database): HybridCollectionPayloads {
  return {
    accountStatusHistories: buildAccountStatusHistoriesSnapshot(database),
    adminAuditLogs: database.adminAuditLogs,
    archivedMedia: database.archivedMedia,
    dialogMessages: database.dialogMessages,
    groupMessages: database.groupMessages,
    groups: database.groups,
    ipAccessLogs: database.ipAccessLogs,
    pendingChannelInvitations: database.pendingChannelInvitations,
    pendingGroupInvitations: database.pendingGroupInvitations,
    pendingMediaUploads: database.pendingMediaUploads,
    subscriptionChannels: database.subscriptionChannels,
    subscriptionPosts: database.subscriptionPosts,
    supportTickets: database.supportTickets,
    threadStates: database.threadStates,
  }
}

export function hydrateDatabaseWithHybridCollections(
  database: Database,
  collections: HybridCollectionPayloads,
): Database {
  return {
    ...database,
    accounts: hydrateAccountsWithStatusHistories(database.accounts, collections.accountStatusHistories),
    adminAuditLogs: collections.adminAuditLogs,
    archivedMedia: collections.archivedMedia,
    dialogMessages: collections.dialogMessages,
    groupMessages: collections.groupMessages,
    groups: collections.groups,
    ipAccessLogs: collections.ipAccessLogs,
    pendingChannelInvitations: collections.pendingChannelInvitations,
    pendingGroupInvitations: collections.pendingGroupInvitations,
    pendingMediaUploads: collections.pendingMediaUploads,
    subscriptionChannels: collections.subscriptionChannels,
    subscriptionPosts: collections.subscriptionPosts,
    supportTickets: collections.supportTickets,
    threadStates: collections.threadStates,
  }
}

function databaseHasHybridCollectionData(database: Database) {
  const snapshot = buildHybridCollectionsSnapshot(database)
  return HYBRID_COLLECTION_NAMES.some((name) => snapshot[name].length > 0)
}

function createEmptyHybridCollections(): HybridCollectionPayloads {
  return {
    accountStatusHistories: [],
    adminAuditLogs: [],
    archivedMedia: [],
    dialogMessages: [],
    groupMessages: [],
    groups: [],
    ipAccessLogs: [],
    pendingChannelInvitations: [],
    pendingGroupInvitations: [],
    pendingMediaUploads: [],
    subscriptionChannels: [],
    subscriptionPosts: [],
    supportTickets: [],
    threadStates: [],
  }
}

function createEmptyHybridRowPresence(): HybridCollectionRowPresence {
  return {
    accountStatusHistories: false,
    adminAuditLogs: false,
    archivedMedia: false,
    dialogMessages: false,
    groupMessages: false,
    groups: false,
    ipAccessLogs: false,
    pendingChannelInvitations: false,
    pendingGroupInvitations: false,
    pendingMediaUploads: false,
    subscriptionChannels: false,
    subscriptionPosts: false,
    supportTickets: false,
    threadStates: false,
  }
}

function createEmptyHybridPersistenceCache(): HybridPersistenceCache {
  return {
    collections: {
      accountStatusHistories: new Map<string, string>(),
      adminAuditLogs: new Map<string, string>(),
      archivedMedia: new Map<string, string>(),
      dialogMessages: new Map<string, string>(),
      groupMessages: new Map<string, string>(),
      groups: new Map<string, string>(),
      ipAccessLogs: new Map<string, string>(),
      pendingChannelInvitations: new Map<string, string>(),
      pendingGroupInvitations: new Map<string, string>(),
      pendingMediaUploads: new Map<string, string>(),
      subscriptionChannels: new Map<string, string>(),
      subscriptionPosts: new Map<string, string>(),
      supportTickets: new Map<string, string>(),
      threadStates: new Map<string, string>(),
    },
    slimPayloadJson: null,
  }
}

function createHybridPersistenceCache(database: Database): HybridPersistenceCache {
  const cache = createEmptyHybridPersistenceCache()
  const slimPayload = stripHybridCollectionsFromDatabase(database)
  const hybridSnapshot = buildHybridCollectionsSnapshot(database)
  cache.slimPayloadJson = JSON.stringify(slimPayload)

  for (const name of HYBRID_COLLECTION_NAMES) {
    const definition = getHybridCollectionDefinition(name) as HybridTableDefinition<typeof name>
    const target = cache.collections[name]
    for (const item of hybridSnapshot[name]) {
      target.set(
        buildHybridCollectionKey(definition, item as HybridCollectionPayloads[typeof name][number]),
        JSON.stringify(item),
      )
    }
  }

  return cache
}

async function ensureStateTable(pool: Pool, stateTableName: string) {
  const safeTableName = assertSafeIdentifier(stateTableName)

  await pool.query(`
    create table if not exists ${safeTableName} (
      id integer primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `)
}

async function ensureHybridTables(pool: Pool, stateTableName: string) {
  for (const definition of Object.values(HYBRID_COLLECTION_DEFINITIONS)) {
    const tableName = getHybridTableName(stateTableName, definition.tableSuffix)
    await pool.query(definition.createTableSql(tableName))
  }
}

async function loadHybridCollections(
  pool: Pool,
  stateTableName: string,
): Promise<LoadedHybridCollections> {
  const collections = createEmptyHybridCollections()
  const rowPresence = createEmptyHybridRowPresence()

  for (const name of HYBRID_COLLECTION_NAMES) {
    const definition = getHybridCollectionDefinition(name)
    const tableName = getHybridTableName(stateTableName, definition.tableSuffix)
    const result = await pool.query<{ payload: unknown }>(
      `select payload from ${tableName} order by ${definition.loadOrderBy}`,
    )
    setHybridCollection(
      collections,
      name,
      result.rows.map((row) => row.payload as HybridCollectionPayloads[typeof name][number]) as HybridCollectionPayloads[typeof name],
    )
    rowPresence[name] = (result.rowCount ?? 0) > 0
  }

  return {
    collections,
    rowPresence,
  }
}

async function loadDatabaseFromPostgres(pool: Pool, stateTableName: string) {
  const safeTableName = assertSafeIdentifier(stateTableName)
  await ensureStateTable(pool, safeTableName)
  await ensureHybridTables(pool, safeTableName)

  const stateResult = await pool.query<{ payload: unknown }>(
    `select payload from ${safeTableName} where id = $1`,
    [1],
  )
  const statePayload = stateResult.rows[0]?.payload
  const loadedHybridCollections = await loadHybridCollections(pool, safeTableName)
  const hasHybridRows = HYBRID_COLLECTION_NAMES.some((name) => loadedHybridCollections.rowPresence[name])

  if (statePayload) {
    const coercedState = coerceDatabasePayload(statePayload)
    const legacyCollections = buildHybridCollectionsSnapshot(coercedState.database)
    const mergedCollections = createEmptyHybridCollections()
    let needsHybridBackfill = false

    for (const name of HYBRID_COLLECTION_NAMES) {
      if (loadedHybridCollections.rowPresence[name]) {
        setHybridCollection(mergedCollections, name, loadedHybridCollections.collections[name])
        continue
      }
      setHybridCollection(mergedCollections, name, legacyCollections[name])
      if (legacyCollections[name].length > 0) {
        needsHybridBackfill = true
      }
    }

    const mergedDatabase = hasHybridRows || needsHybridBackfill
      ? hydrateDatabaseWithHybridCollections(coercedState.database, mergedCollections)
      : coercedState.database

    const mergedState = hasHybridRows || needsHybridBackfill
      ? coerceDatabasePayload(mergedDatabase)
      : coercedState

    const needsPersistenceRewrite =
      mergedState.needsPersistenceRewrite ||
      needsHybridBackfill ||
      !hasHybridRows && databaseHasHybridCollectionData(coercedState.database)

    return {
      ...mergedState,
      bootstrapSource: 'postgres' as const,
      needsPersistenceRewrite,
      persistenceCache: hasHybridRows || needsHybridBackfill
        ? createHybridPersistenceCache(mergedState.database)
        : createEmptyHybridPersistenceCache(),
      storageLayout: 'hybrid-normalized' as const,
    }
  }

  if (runtimeConfig.storage.postgres.bootstrapFromFile) {
    const fileState = await loadDatabaseFromFile(runtimeConfig.storage.dataFilePath)
    return {
      ...fileState,
      bootstrapSource: hasNonEmptyState(fileState.database) ? ('file' as const) : ('empty' as const),
      persistenceCache: createEmptyHybridPersistenceCache(),
      storageLayout: 'hybrid-normalized' as const,
    }
  }

  return {
    ...coerceDatabasePayload(undefined),
    bootstrapSource: 'empty' as const,
    persistenceCache: createEmptyHybridPersistenceCache(),
    storageLayout: 'hybrid-normalized' as const,
  }
}

async function persistSlimDatabaseToPostgres(
  client: PoolClient,
  stateTableName: string,
  payloadJson: string,
) {
  const safeTableName = assertSafeIdentifier(stateTableName)

  await client.query(
    `
      insert into ${safeTableName} (id, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    [1, payloadJson],
  )
}

async function persistHybridCollection<Name extends HybridCollectionName>(
  client: PoolClient,
  stateTableName: string,
  definition: HybridTableDefinition<Name>,
  items: HybridCollectionPayloads[Name],
  previousEntries: Map<string, string>,
) {
  const tableName = getHybridTableName(stateTableName, definition.tableSuffix)
  const nextEntries = new Map<string, string>()

  for (const item of items) {
    const payloadJson = JSON.stringify(item)
    nextEntries.set(buildHybridCollectionKey(definition, item), payloadJson)
  }

  let didMutate = false

  for (const [key] of previousEntries) {
    if (nextEntries.has(key)) continue
    await client.query(definition.buildDeleteQuery(tableName), parseHybridCollectionKey(key))
    didMutate = true
  }

  for (const item of items) {
    const key = buildHybridCollectionKey(definition, item)
    const payloadJson = nextEntries.get(key)
    if (!payloadJson) continue
    if (previousEntries.get(key) === payloadJson) continue
    await client.query(definition.buildInsertQuery(tableName), [
      ...definition.buildKeyParts(item),
      payloadJson,
    ])
    didMutate = true
  }

  return {
    didMutate,
    nextEntries,
  }
}

async function persistHybridCollectionByName<Name extends HybridCollectionName>(
  client: PoolClient,
  stateTableName: string,
  name: Name,
  database: Database,
  cache: HybridPersistenceCache,
) {
  const definition = HYBRID_COLLECTION_DEFINITIONS[name]
  const hybridSnapshot = buildHybridCollectionsSnapshot(database)
  const result = await persistHybridCollection(
    client,
    stateTableName,
    definition,
    hybridSnapshot[name],
    cache.collections[name],
  )

  if (result.didMutate) {
    cache.collections[name] = result.nextEntries
  }
}

function hasHybridCollectionEntries(cache: HybridPersistenceCache) {
  return Object.values(cache.collections).some((collection) => collection.size > 0)
}

async function persistDatabaseToPostgres(
  pool: Pool,
  stateTableName: string,
  database: Database,
  cache: HybridPersistenceCache,
) {
  const slimPayloadJson = JSON.stringify(stripHybridCollectionsFromDatabase(database))
  const client = await pool.connect()

  try {
    await client.query('begin')

    if (cache.slimPayloadJson !== slimPayloadJson) {
      await persistSlimDatabaseToPostgres(client, stateTableName, slimPayloadJson)
      cache.slimPayloadJson = slimPayloadJson
    }

    for (const name of HYBRID_COLLECTION_NAMES) {
      await persistHybridCollectionByName(client, stateTableName, name, database, cache)
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function createStore(): Promise<{ metadata: StoreMetadata; store: AppStore }> {
  if (runtimeConfig.storage.mode === 'file') {
    const store = await TinychokStore.load(runtimeConfig.storage.dataFilePath)
    return {
      metadata: {
        mode: 'file',
      },
      store,
    }
  }

  const pool = createPostgresPool()
  const stateTableName = runtimeConfig.storage.postgres.stateTableName
  const initialState = await loadDatabaseFromPostgres(pool, stateTableName)
  let persistenceCache = hasHybridCollectionEntries(initialState.persistenceCache)
    ? initialState.persistenceCache
    : createEmptyHybridPersistenceCache()

  const store = TinychokStore.create(initialState.database, async (database) => {
    await persistDatabaseToPostgres(pool, stateTableName, database, persistenceCache)
    persistenceCache = createHybridPersistenceCache(database)
  })

  if (initialState.bootstrapSource !== 'postgres' || initialState.needsPersistenceRewrite) {
    await persistDatabaseToPostgres(pool, stateTableName, initialState.database, persistenceCache)
    persistenceCache = createHybridPersistenceCache(initialState.database)
  }

  return {
    metadata: {
      bootstrapSource: initialState.bootstrapSource,
      mode: 'postgres',
      stateTableName,
      storageLayout: initialState.storageLayout,
    },
    store,
  }
}
