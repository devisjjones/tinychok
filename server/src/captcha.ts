import { runtimeConfig } from './config'

type CaptchaAction = 'auth.request-code' | 'auth.verify-code' | 'auth.register'

type CaptchaVerificationContext = {
  action: CaptchaAction
  remoteIp?: string
  token?: string
}

type TurnstileVerificationResponse = {
  success?: boolean
}

type SmartCaptchaVerificationResponse = {
  host?: string
  message?: string
  status?: string
}

function isCaptchaEnabled() {
  return runtimeConfig.auth.captcha.provider !== 'disabled'
}

async function verifyTurnstileCaptcha(token: string, remoteIp?: string) {
  const secretKey = runtimeConfig.auth.captcha.secretKey

  if (!secretKey) {
    throw new Error('Captcha provider настроен некорректно на сервере.')
  }

  const body = new URLSearchParams({
    response: token,
    secret: secretKey,
  })

  if (remoteIp) {
    body.set('remoteip', remoteIp)
  }

  const response = await fetch(runtimeConfig.auth.captcha.verifyUrl, {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Не удалось проверить captcha.')
  }

  const payload = (await response.json()) as TurnstileVerificationResponse

  if (!payload.success) {
    throw new Error('Подтвердите, что вы не робот.')
  }
}

async function verifySmartCaptcha(token: string, remoteIp?: string) {
  const secretKey = runtimeConfig.auth.captcha.secretKey

  if (!secretKey) {
    throw new Error('Captcha provider настроен некорректно на сервере.')
  }

  const body = new URLSearchParams({
    secret: secretKey,
    token,
  })

  if (remoteIp) {
    body.set('ip', remoteIp)
  }

  const response = await fetch(runtimeConfig.auth.captcha.verifyUrl, {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Не удалось проверить captcha.')
  }

  const payload = (await response.json()) as SmartCaptchaVerificationResponse

  if (payload.status !== 'ok') {
    throw new Error(payload.message?.trim() || 'Подтвердите, что вы не робот.')
  }
}

export async function verifyCaptchaOrThrow({ remoteIp, token }: CaptchaVerificationContext) {
  if (!isCaptchaEnabled()) return

  const normalizedToken = token?.trim()
  if (!normalizedToken) {
    throw new Error('Подтвердите, что вы не робот.')
  }

  if (runtimeConfig.auth.captcha.provider === 'turnstile') {
    await verifyTurnstileCaptcha(normalizedToken, remoteIp)
    return
  }

  if (runtimeConfig.auth.captcha.provider === 'smartcaptcha') {
    await verifySmartCaptcha(normalizedToken, remoteIp)
  }
}
