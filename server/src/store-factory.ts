import { Pool } from 'pg'
import { runtimeConfig } from './config'
import type { AppStore, StoreMetadata } from './store-contract'
import { coerceDatabasePayload, loadDatabaseFromFile, TinychokStore } from './store'

function assertSafeIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new Error('Некорректное имя PostgreSQL таблицы для state store.')
  }

  return value
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

async function loadDatabaseFromPostgres(pool: Pool, stateTableName: string) {
  const safeTableName = assertSafeIdentifier(stateTableName)
  await ensureStateTable(pool, safeTableName)

  const result = await pool.query<{ payload: unknown }>(
    `select payload from ${safeTableName} where id = $1`,
    [1],
  )

  if (result.rows[0]?.payload) {
    return {
      ...coerceDatabasePayload(result.rows[0].payload),
      bootstrapSource: 'postgres' as const,
    }
  }

  if (runtimeConfig.storage.postgres.bootstrapFromFile) {
    const fileState = await loadDatabaseFromFile(runtimeConfig.storage.dataFilePath)
    return {
      ...fileState,
      bootstrapSource: hasNonEmptyState(fileState.database) ? ('file' as const) : ('empty' as const),
    }
  }

  return {
    ...coerceDatabasePayload(undefined),
    bootstrapSource: 'empty' as const,
  }
}

async function persistDatabaseToPostgres(pool: Pool, stateTableName: string, payload: unknown) {
  const safeTableName = assertSafeIdentifier(stateTableName)

  await pool.query(
    `
      insert into ${safeTableName} (id, payload, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (id) do update
      set payload = excluded.payload,
          updated_at = now()
    `,
    [1, JSON.stringify(payload)],
  )
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
  const store = TinychokStore.create(initialState.database, async (database) =>
    persistDatabaseToPostgres(pool, stateTableName, database),
  )

  if (initialState.bootstrapSource !== 'postgres' || initialState.needsPersistenceRewrite) {
    await persistDatabaseToPostgres(pool, stateTableName, initialState.database)
  }

  return {
    metadata: {
      bootstrapSource: initialState.bootstrapSource,
      mode: 'postgres',
      stateTableName,
    },
    store,
  }
}
