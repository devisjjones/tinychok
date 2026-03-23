import { useCallback, useState } from 'react'
import type { ClientRuntimeConfigResponse } from '../shared/backend'

type CaptchaConfig = ClientRuntimeConfigResponse['captcha']

export function useCaptcha(captchaConfig?: CaptchaConfig | null) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  return {
    captchaProvider: captchaConfig?.provider ?? 'disabled',
    captchaRequired: Boolean(captchaConfig?.enabled),
    captchaSiteKey: captchaConfig?.siteKey ?? null,
    captchaToken: captchaConfig?.enabled ? captchaToken : null,
    resetCaptcha,
    setCaptchaToken,
  }
}
