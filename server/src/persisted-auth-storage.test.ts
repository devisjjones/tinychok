import assert from 'node:assert/strict'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import { accountsStorageKey, sessionStorageKey } from '../../src/app/constants'
import {
  loadPersistedAuthState,
  saveAccounts,
  saveSession,
} from '../../src/app/storage'

const persistedAuthSchemaStorageKey = `${sessionStorageKey}:schema-version`

function withDom(run: (dom: JSDOM) => void) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://tinychok.test',
  })
  const globalTarget = globalThis as Record<string, unknown>
  const previousWindow = globalTarget.window
  const previousDocument = globalTarget.document
  const previousLocalStorage = globalTarget.localStorage

  globalTarget.window = dom.window as unknown
  globalTarget.document = dom.window.document as unknown
  globalTarget.localStorage = dom.window.localStorage as unknown

  try {
    run(dom)
  } finally {
    if (previousWindow === undefined) {
      delete globalTarget.window
    } else {
      globalTarget.window = previousWindow
    }

    if (previousDocument === undefined) {
      delete globalTarget.document
    } else {
      globalTarget.document = previousDocument
    }

    if (previousLocalStorage === undefined) {
      delete globalTarget.localStorage
    } else {
      globalTarget.localStorage = previousLocalStorage
    }
  }
}

test('persisted auth state round-trips session and accounts through a versioned schema marker', () => {
  withDom(() => {
    saveAccounts([
      {
        avatarImage: undefined,
        blockedContactIds: [1],
        browserNotificationsEnabled: true,
        createdAt: '2026-04-13T00:00:00.000Z',
        darkThemeEnabled: true,
        displayName: 'Алексей',
        identifier: '+79990000000',
        invisibilityAutoEnabled: false,
        invisibilityEnabled: false,
        nickname: '',
        premium: false,
        premiumExpiresAt: undefined,
        quietModeEnabled: false,
        quietModeSettings: undefined,
        soundsDisabled: false,
        status: '',
        surname: '',
      },
    ])
    saveSession({
      avatarImage: undefined,
      blockedContactIds: [1],
      browserNotificationsEnabled: true,
      darkThemeEnabled: true,
      displayName: 'Алексей',
      identifier: '+79990000000',
      invisibilityAutoEnabled: false,
      invisibilityEnabled: false,
      nickname: '',
      premium: false,
      premiumExpiresAt: undefined,
      quietModeEnabled: false,
      quietModeSettings: undefined,
      sessionToken: 'session-token',
      soundsDisabled: false,
      status: '',
      surname: '',
    })

    const nextState = loadPersistedAuthState()

    assert.equal(window.localStorage.getItem(persistedAuthSchemaStorageKey), '2')
    assert.equal(nextState.accounts.length, 1)
    assert.equal(nextState.accounts[0]?.identifier, '+79990000000')
    assert.equal(nextState.session?.sessionToken, 'session-token')
    assert.equal(nextState.session?.darkThemeEnabled, true)
  })
})

test('persisted auth state invalidates stale snapshots when schema version changes', () => {
  withDom(() => {
    window.localStorage.setItem(
      accountsStorageKey,
      JSON.stringify([{ identifier: '+79990000000', displayName: 'Старый аккаунт' }]),
    )
    window.localStorage.setItem(
      sessionStorageKey,
      JSON.stringify({ identifier: '+79990000000', sessionToken: 'legacy-token' }),
    )
    window.localStorage.setItem(persistedAuthSchemaStorageKey, '1')

    const nextState = loadPersistedAuthState()

    assert.deepEqual(nextState.accounts, [])
    assert.equal(nextState.session, null)
    assert.equal(window.localStorage.getItem(accountsStorageKey), null)
    assert.equal(window.localStorage.getItem(sessionStorageKey), null)
    assert.equal(window.localStorage.getItem(persistedAuthSchemaStorageKey), '2')
  })
})
