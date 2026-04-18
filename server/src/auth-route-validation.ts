import type {
  AuthEntrypoint,
  AuthRequestCodeFlow,
  RequestCodeBody,
  VerifyCodeBody,
} from '../../src/shared/backend'
import { HttpError } from './http-error'

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export function parseAuthEntrypoint(value: unknown): AuthEntrypoint {
  if (value === undefined || value === null || value === 'user') {
    return 'user'
  }

  if (value === 'admin') {
    return 'admin'
  }

  throw new HttpError(400, 'Некорректная точка входа auth-flow.')
}

export function parseAuthRequestCodeFlow(value: unknown): AuthRequestCodeFlow {
  if (value === undefined || value === null || value === 'default') {
    return 'default'
  }

  if (value === 'password-reset') {
    return 'password-reset'
  }

  throw new HttpError(400, 'Некорректный режим запроса SMS-кода.')
}

export function parseRequestCodeBody(value: unknown): RequestCodeBody & {
  entryPoint: AuthEntrypoint
  flow: AuthRequestCodeFlow
} {
  const body = (value ?? {}) as RequestCodeBody

  return {
    captchaToken: readOptionalString(body.captchaToken),
    entryPoint: parseAuthEntrypoint(body.entryPoint),
    flow: parseAuthRequestCodeFlow(body.flow),
    identifier: readOptionalString(body.identifier) ?? '',
  }
}

export function parseVerifyCodeBody(value: unknown): VerifyCodeBody & {
  entryPoint: AuthEntrypoint
} {
  const body = (value ?? {}) as VerifyCodeBody

  return {
    code: readOptionalString(body.code) ?? '',
    entryPoint: parseAuthEntrypoint(body.entryPoint),
    identifier: readOptionalString(body.identifier) ?? '',
  }
}

export type SmsOtpApiPurpose = 'login' | 'register' | 'reset_password'

function parseSmsOtpApiPurpose(value: unknown): SmsOtpApiPurpose {
  if (value === undefined || value === null || value === 'login') {
    return 'login'
  }

  if (value === 'register' || value === 'reset_password') {
    return value
  }

  throw new HttpError(400, 'Некорректный сценарий SMS OTP авторизации.')
}

export function parseSmsRequestBody(value: unknown) {
  const body = (value ?? {}) as {
    captchaToken?: string
    phone?: string
    purpose?: SmsOtpApiPurpose
  }

  return {
    captchaToken: readOptionalString(body.captchaToken),
    phone: readOptionalString(body.phone) ?? '',
    purpose: parseSmsOtpApiPurpose(body.purpose),
  }
}

export function parseSmsVerifyBody(value: unknown) {
  const body = (value ?? {}) as {
    challengeId?: string
    code?: string
    phone?: string
    purpose?: SmsOtpApiPurpose
  }

  return {
    challengeId: readOptionalString(body.challengeId),
    code: readOptionalString(body.code) ?? '',
    phone: readOptionalString(body.phone) ?? '',
    purpose: parseSmsOtpApiPurpose(body.purpose),
  }
}
