import type { CookieConsentChoice } from '../app/types'
import '../cookie-consent.css'

type CookieConsentBannerProps = {
  consent: CookieConsentChoice | null
  onChoice: (choice: CookieConsentChoice) => void
}

export function CookieConsentBanner({ consent, onChoice }: CookieConsentBannerProps) {
  if (consent !== null) return null

  return (
    <div className="cookie-banner-wrap">
      <section className="cookie-banner" aria-label="Настройки cookie">
        <div className="cookie-banner-body">
          <p className="eyebrow">Cookie</p>
          <p className="cookie-banner-copy">
            Тайничок использует необходимые cookie для входа, защиты сессии и сохранения настроек.
            Аналитические cookie помогают улучшать сервис и включаются только после вашего
            выбора. Подробнее в{' '}
            <a className="cookie-banner-link" href="/privacy-policy.html">
              Политике обработки персональных данных
            </a>
            .
          </p>
        </div>

        <div className="cookie-banner-actions">
          <button
            type="button"
            className="cookie-banner-button cookie-banner-button-secondary"
            onClick={() => onChoice('necessary')}
          >
            Только необходимые
          </button>
          <button
            type="button"
            className="cookie-banner-button cookie-banner-button-primary"
            onClick={() => onChoice('analytics')}
          >
            Принять аналитику
          </button>
        </div>
      </section>
    </div>
  )
}
