import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('staging does not treat seeded mock phone as disposable fixture account', () => {
  const script = `
    import { coerceDatabasePayload } from './server/src/store.ts'

    const payload = {
      accounts: [{
        accountId: 'real-account',
        blockedContactIds: [],
        createdAt: '2026-03-28T00:00:00.000Z',
        deletedBySelfService: false,
        displayName: 'Real user',
        gifLibrary: [],
        identifier: '+79673215453',
        isTestEntity: false,
        lastActiveAt: '2026-03-28T00:00:00.000Z',
        nickname: '',
        premium: false,
        publicDeleted: false,
        soundsDisabled: true,
        status: '',
        surname: '',
      }],
      dialogs: [],
      groups: [],
      managedChannels: [],
      subscriptionChannels: [],
      subscriptionPosts: [],
      sessions: [],
      threadStates: [],
      adminAuditLogs: [],
      adminReports: [],
      authChallenges: [],
      authCodeSendAttempts: [],
      contactReports: [],
      dialogMessages: [],
      groupMessages: [],
      ipAccessLogs: [],
      passwordAuthAttempts: [],
      pendingChannelInvitations: [],
      pendingGroupInvitations: [],
      pendingMediaUploads: [],
      subscriptionChannelReports: [],
    }

    const { database } = coerceDatabasePayload(payload)
    const account = database.accounts.find((candidate) => candidate.identifier === '+79673215453') ?? null
    console.log(JSON.stringify({
      accountCount: database.accounts.length,
      exists: Boolean(account),
      isTestEntity: account?.isTestEntity ?? null,
    }))
  `

  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        TINYCHOK_APP_ENV: 'staging',
        TINYCHOK_CAPTCHA_PROVIDER: 'smartcaptcha',
        TINYCHOK_CAPTCHA_SECRET_KEY: 'test-secret',
        TINYCHOK_CAPTCHA_SITE_KEY: 'test-site-key',
      },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  const parsed = JSON.parse(result.stdout.trim()) as {
    accountCount: number
    exists: boolean
    isTestEntity: boolean | null
  }

  assert.equal(parsed.exists, true)
  assert.equal(parsed.isTestEntity, false)
  assert.equal(parsed.accountCount, 1)
})
