import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { passwordFieldMinLength } from '../../src/shared/constants'

const scrypt = promisify(nodeScrypt)
const passwordBlockDurationsMs = [5 * 60 * 1000, 30 * 60 * 1000, 24 * 60 * 60 * 1000] as const
const passwordFailuresPerBlock = 5
const passwordCaptchaThreshold = 3

export type StoredAccountPasswordFields = {
  passwordHash?: string
  passwordSetAt?: string
}

export type PasswordAuthAttemptRecord = {
  blockedUntil?: string
  blockLevel: number
  failedCount: number
  identifier: string
  ip: string
  lastFailedAt: string
}

export function hasAccountPassword(account: Pick<StoredAccountPasswordFields, 'passwordHash'> | null | undefined) {
  return Boolean(account?.passwordHash?.trim())
}

export function assertValidPassword(password: string, confirmPassword: string) {
  if (password.length < passwordFieldMinLength) {
    throw new Error(`Пароль должен быть не короче ${passwordFieldMinLength} символов.`)
  }

  if (password !== confirmPassword) {
    throw new Error('Пароли не совпадают.')
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt}$${derivedKey.toString('base64url')}`
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, expectedHash] = passwordHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHash) {
    return false
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer
  const expectedBuffer = Buffer.from(expectedHash, 'base64url')
  if (derivedKey.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(derivedKey, expectedBuffer)
}

function parseIsoDate(value?: string) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function getPasswordAttemptBlockState(record: PasswordAuthAttemptRecord | null | undefined, now = Date.now()) {
  if (!record?.blockedUntil) {
    return null
  }

  const blockedUntil = parseIsoDate(record.blockedUntil)
  if (blockedUntil === null || blockedUntil <= now) {
    return null
  }

  return {
    blockLevel: record.blockLevel,
    blockedUntil: record.blockedUntil,
    remainingMs: blockedUntil - now,
  }
}

export function shouldRequirePasswordCaptcha(
  record: PasswordAuthAttemptRecord | null | undefined,
  now = Date.now(),
) {
  if (!record) {
    return false
  }

  if (getPasswordAttemptBlockState(record, now)) {
    return false
  }

  return record.failedCount >= passwordCaptchaThreshold
}

export function registerFailedPasswordAttempt(
  existingRecord: PasswordAuthAttemptRecord | null | undefined,
  context: { identifier: string; ip: string },
  nowIso = new Date().toISOString(),
) {
  const nextFailedCount = (existingRecord?.failedCount ?? 0) + 1
  const nextBlockLevel = Math.min(
    Math.max(0, Math.ceil(nextFailedCount / passwordFailuresPerBlock) - 1),
    passwordBlockDurationsMs.length - 1,
  )
  const reachedThreshold = nextFailedCount % passwordFailuresPerBlock === 0
  const blockedUntil = reachedThreshold
    ? new Date(Date.parse(nowIso) + passwordBlockDurationsMs[nextBlockLevel]).toISOString()
    : existingRecord?.blockedUntil

  return {
    didTriggerBlock: reachedThreshold,
    record: {
      blockLevel: reachedThreshold ? nextBlockLevel : existingRecord?.blockLevel ?? 0,
      blockedUntil: reachedThreshold ? blockedUntil : existingRecord?.blockedUntil,
      failedCount: nextFailedCount,
      identifier: context.identifier,
      ip: context.ip,
      lastFailedAt: nowIso,
    } satisfies PasswordAuthAttemptRecord,
  }
}
