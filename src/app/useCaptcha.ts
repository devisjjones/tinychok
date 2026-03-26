import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientRuntimeConfigResponse } from '../shared/backend'

type CaptchaConfig = ClientRuntimeConfigResponse['captcha']
type SmartCaptchaLanguage = 'ru' | 'en' | 'be' | 'kk' | 'tt' | 'uk' | 'uz' | 'tr'
type SmartCaptchaWidgetId = number | string
type SmartCaptchaSubscribeEvent =
  | 'challenge-visible'
  | 'challenge-hidden'
  | 'network-error'
  | 'javascript-error'
  | 'success'
  | 'token-expired'

type SmartCaptchaApi = {
  destroy: (widgetId?: SmartCaptchaWidgetId) => void
  render: (
    container: HTMLElement | string,
    params: {
      callback?: (token: string) => void
      hl?: SmartCaptchaLanguage
      sitekey: string
    },
  ) => SmartCaptchaWidgetId
  reset: (widgetId?: SmartCaptchaWidgetId) => void
  subscribe: (
    widgetId: SmartCaptchaWidgetId,
    event: SmartCaptchaSubscribeEvent,
    callback: (...args: unknown[]) => void,
  ) => (() => void) | undefined
}

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaApi
    tinychokSmartCaptchaOnload?: () => void
  }
}

const SMART_CAPTCHA_SCRIPT_ID = 'tinychok-smartcaptcha-script'
const SMART_CAPTCHA_ONLOAD = 'tinychokSmartCaptchaOnload'
const SMART_CAPTCHA_SCRIPT_SRC = `https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload&onload=${SMART_CAPTCHA_ONLOAD}`
const SUPPORTED_SMART_CAPTCHA_LANGUAGES = new Set<SmartCaptchaLanguage>([
  'ru',
  'en',
  'be',
  'kk',
  'tt',
  'uk',
  'uz',
  'tr',
])

let smartCaptchaScriptPromise: Promise<SmartCaptchaApi> | null = null

function getSmartCaptchaLanguage(): SmartCaptchaLanguage {
  const browserLanguage = typeof navigator === 'undefined' ? 'ru' : navigator.language.slice(0, 2).toLowerCase()

  return SUPPORTED_SMART_CAPTCHA_LANGUAGES.has(browserLanguage as SmartCaptchaLanguage)
    ? (browserLanguage as SmartCaptchaLanguage)
    : 'ru'
}

function loadSmartCaptchaScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SmartCaptcha недоступна вне браузера.'))
  }

  if (window.smartCaptcha) {
    return Promise.resolve(window.smartCaptcha)
  }

  if (smartCaptchaScriptPromise) {
    return smartCaptchaScriptPromise
  }

  smartCaptchaScriptPromise = new Promise<SmartCaptchaApi>((resolve, reject) => {
    const handleReady = () => {
      if (window.smartCaptcha) {
        resolve(window.smartCaptcha)
        return
      }

      reject(new Error('Не удалось загрузить SmartCaptcha.'))
    }

    const handleError = () => {
      reject(new Error('Не удалось загрузить SmartCaptcha.'))
    }

    window[SMART_CAPTCHA_ONLOAD] = handleReady

    const existingScript = document.getElementById(SMART_CAPTCHA_SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener('error', handleError, { once: true })
      if (window.smartCaptcha) {
        handleReady()
      }
      return
    }

    const script = document.createElement('script')
    script.id = SMART_CAPTCHA_SCRIPT_ID
    script.src = SMART_CAPTCHA_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  }).catch((error) => {
    smartCaptchaScriptPromise = null
    throw error
  })

  return smartCaptchaScriptPromise
}

export function useCaptcha(captchaConfig?: CaptchaConfig | null, active = true) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const apiRef = useRef<SmartCaptchaApi | null>(null)
  const widgetIdRef = useRef<SmartCaptchaWidgetId | null>(null)
  const unsubscribeFnsRef = useRef<Array<() => void>>([])
  const [captchaBusy, setCaptchaBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null)
    setCaptchaBusy(false)

    if (apiRef.current && widgetIdRef.current !== null) {
      apiRef.current.reset(widgetIdRef.current)
    }
  }, [])

  useEffect(() => {
    if (!active || !captchaConfig?.enabled || captchaConfig.provider !== 'smartcaptcha' || !captchaConfig.siteKey) {
      return
    }

    let cancelled = false
    const siteKey = captchaConfig.siteKey

    void loadSmartCaptchaScript()
      .then((api) => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) {
          return
        }

        apiRef.current = api
        widgetIdRef.current = api.render(containerRef.current, {
          callback: (token) => {
            setCaptchaToken(token)
            setCaptchaBusy(false)
          },
          hl: getSmartCaptchaLanguage(),
          sitekey: siteKey,
        })

        const widgetId = widgetIdRef.current
        unsubscribeFnsRef.current = [
          api.subscribe(widgetId, 'challenge-visible', () => {
            setCaptchaBusy(true)
          }),
          api.subscribe(widgetId, 'challenge-hidden', () => {
            setCaptchaBusy(false)
          }),
          api.subscribe(widgetId, 'network-error', () => {
            setCaptchaToken(null)
            setCaptchaBusy(false)
          }),
          api.subscribe(widgetId, 'javascript-error', () => {
            setCaptchaToken(null)
            setCaptchaBusy(false)
          }),
          api.subscribe(widgetId, 'token-expired', () => {
            setCaptchaToken(null)
            setCaptchaBusy(false)
          }),
        ].filter((handler): handler is () => void => Boolean(handler))
      })
      .catch((error) => {
        console.error('Failed to initialize SmartCaptcha', error)
      })

    return () => {
      cancelled = true
      unsubscribeFnsRef.current.forEach((unsubscribe) => unsubscribe())
      unsubscribeFnsRef.current = []

      if (apiRef.current && widgetIdRef.current !== null) {
        apiRef.current.destroy(widgetIdRef.current)
      }

      apiRef.current = null
      widgetIdRef.current = null
      setCaptchaToken(null)
      setCaptchaBusy(false)
    }
  }, [active, captchaConfig?.enabled, captchaConfig?.provider, captchaConfig?.siteKey])

  const getCaptchaTokenOrThrow = useCallback(() => {
    if (!captchaConfig?.enabled) {
      return undefined
    }

    const normalizedToken = captchaToken?.trim()
    if (!normalizedToken) {
      throw new Error('Сначала подтвердите, что вы не робот.')
    }

    return normalizedToken
  }, [captchaConfig?.enabled, captchaToken])

  return {
    captchaBusy,
    captchaContainerRef: containerRef,
    captchaProvider: captchaConfig?.provider ?? 'disabled',
    captchaRequired: Boolean(captchaConfig?.enabled),
    getCaptchaTokenOrThrow,
    resetCaptcha,
  }
}
