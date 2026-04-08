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
