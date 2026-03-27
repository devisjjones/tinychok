export type UserAuthAnalyticsFlow = 'password-reset' | 'password-setup' | 'registration'

export const passwordLoginBlockedMessage =
  'Вход временно заблокирован после нескольких неудачных попыток. Повторите позже.'
export const passwordLoginRateLimitedMessage =
  'Слишком много неудачных попыток входа. Повторите позже.'

export function mapAuthAnalyticsFlow(flow: UserAuthAnalyticsFlow) {
  return flow === 'password-setup' ? 'legacy-password-setup' : flow
}

export function isPasswordLoginBlockedMessage(message: string) {
  return message.trim() === passwordLoginBlockedMessage
}

export function isPasswordLoginRateLimitedMessage(message: string) {
  return message.trim() === passwordLoginRateLimitedMessage
}
