import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coerceDatabasePayload,
  TinychokStore,
  type Database,
} from './store'

function createStore() {
  const { database } = coerceDatabasePayload(undefined)
  return TinychokStore.create(database, async () => undefined)
}

function getStoreDatabase(store: TinychokStore) {
  return (store as unknown as Record<string, Database>)['database']
}

function createAccount(
  identifier: string,
  options?: {
    displayName?: string
    staffRole?: Database['accounts'][number]['staffRole']
    surname?: string
  },
): Database['accounts'][number] {
  return {
    accountId: `account_${identifier}`,
    avatarImage: undefined,
    archivedOriginalIdentifier: undefined,
    archivedProfile: undefined,
    blockedAt: undefined,
    blockedReason: undefined,
    blockedContactIds: [],
    createdAt: '2026-04-10T20:00:00.000Z',
    deletedAt: undefined,
    deletedBySelfService: undefined,
    deletionMode: undefined,
    displayName: options?.displayName ?? `User ${identifier}`,
    gifLibrary: [],
    identifier,
    isTestEntity: false,
    lastActiveAt: '2026-04-10T20:00:00.000Z',
    nickname: '',
    passwordHash: undefined,
    passwordSetAt: undefined,
    premium: false,
    premiumExpiresAt: undefined,
    publicDeleted: undefined,
    quietModeEnabled: false,
    soundsDisabled: false,
    staffRole: options?.staffRole,
    status: '',
    surname: options?.surname ?? '',
  }
}

function createSession(database: Database, identifier: string, suffix: string) {
  const token = `session-${suffix}`
  database.sessions.push({
    createdAt: '2026-04-10T20:00:00.000Z',
    expiresAt: '2026-05-10T20:00:00.000Z',
    identifier,
    token,
  })
  return token
}

test('admin report detail materializes reporter and related user linked cards', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const reporter = createAccount('+79990101001', {
    displayName: 'Мира',
    surname: 'Репортёр',
  })
  const target = createAccount('+79990101002', {
    displayName: 'Алексей',
    surname: 'Фаундер',
  })
  const staff = createAccount('+79990101003', {
    displayName: 'Staff',
    staffRole: 'owner',
    surname: 'Owner',
  })

  database.accounts.push(reporter, target, staff)

  const reporterToken = createSession(database, reporter.identifier, 'reporter')
  const staffToken = createSession(database, staff.identifier, 'staff')
  const openedDialog = await store.openDirectDialog(reporterToken, { identifier: target.identifier })

  await store.reportContact(reporterToken, openedDialog.dialogId, { reason: 'spam' })

  const reportId = store.adminListReports('open').at(0)?.id
  assert.ok(reportId)

  const report = await store.adminGetReport(staffToken, reportId)

  assert.equal(report.reporter.displayName, 'Мира Репортёр')
  assert.equal(report.reporter.identifier, reporter.identifier)
  assert.equal(report.reporter.lookupIdentifier, reporter.identifier)
  assert.equal(report.relatedUser?.displayName, 'Алексей Фаундер')
  assert.equal(report.relatedUser?.identifier, target.identifier)
  assert.equal(report.relatedUser?.lookupIdentifier, target.identifier)
})

test('admin can hide and restore reports from a noisy reporter without deleting them', async () => {
  const store = createStore()
  const database = getStoreDatabase(store)
  const reporter = createAccount('+79990102001', {
    displayName: 'Спамер',
    surname: 'Репортёр',
  })
  const target = createAccount('+79990102002', {
    displayName: 'Жертва',
    surname: 'Жалобы',
  })
  const staff = createAccount('+79990102003', {
    displayName: 'Owner',
    staffRole: 'owner',
    surname: 'Staff',
  })

  database.accounts.push(reporter, target, staff)

  const reporterToken = createSession(database, reporter.identifier, 'reporter-muted')
  const staffToken = createSession(database, staff.identifier, 'staff-muted')
  const openedDialog = await store.openDirectDialog(reporterToken, { identifier: target.identifier })

  await store.reportContact(reporterToken, openedDialog.dialogId, { reason: 'spam' })

  const initialReportId = store.adminListReports('open').at(0)?.id
  assert.ok(initialReportId)
  assert.equal(store.getAdminDashboard().metrics.openReports, 1)

  await store.adminSetUserReportsMutedInAdmin(staffToken, reporter.identifier, { muted: true })

  assert.equal(store.adminListReports('open').length, 0)
  assert.equal(store.getAdminDashboard().metrics.openReports, 0)
  await assert.rejects(
    async () => store.adminGetReport(staffToken, initialReportId),
    /Жалоба не найдена\./u,
  )

  await store.adminSetUserReportsMutedInAdmin(staffToken, reporter.identifier, { muted: false })

  const restoredReport = store.adminListReports('open').at(0)
  assert.equal(restoredReport?.id, initialReportId)
  assert.equal(store.getAdminDashboard().metrics.openReports, 1)
  const report = await store.adminGetReport(staffToken, initialReportId)
  assert.equal(report.reporter.identifier, reporter.identifier)
})
