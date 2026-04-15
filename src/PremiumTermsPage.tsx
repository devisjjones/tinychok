import { useCookieConsent } from './app/useCookieConsent'
import { usePublicLegalAnalytics } from './app/usePublicLegalAnalytics'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import {
  premiumTermsIntroBlocks,
  premiumTermsPdfPath,
  premiumTermsSections,
  premiumTermsUpdatedAt,
} from './premiumTermsContent'

// Premium checkout relies on this public page and PDF. Breaking these links is a release blocker.
export function PremiumTermsPage() {
  const { analyticsConsentGranted, cookieConsent, updateCookieConsent } = useCookieConsent()
  const { trackPdfOpen } = usePublicLegalAnalytics({
    analyticsConsentGranted,
    document: 'premium-terms',
  })

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">Условия Premium</h1>
              </div>
              <div className="policy-page-badge">Редакция от {premiumTermsUpdatedAt}</div>
            </div>

            {premiumTermsIntroBlocks.map((block) =>
              block.type === 'paragraph' ? (
                <p className="policy-page-copy" key={block.content}>
                  {block.content}
                </p>
              ) : (
                <ul className="policy-page-list" key={block.items.join('|')}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}

            <div className="policy-page-actions">
              <a className="policy-page-link" href="/user-agreement.html">
                Пользовательское соглашение
              </a>
              <a className="policy-page-link" href="/privacy-policy.html">
                Политика данных
              </a>
              <a className="policy-page-link" href="/contacts.html">
                Контакты и реквизиты
              </a>
              <a
                className="policy-page-button"
                href={premiumTermsPdfPath}
                download="Условия Premium. Тайничок.pdf"
                onClick={() => {
                  trackPdfOpen('download')
                }}
              >
                Скачать
              </a>
              <a
                className="policy-page-link"
                href={premiumTermsPdfPath}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  trackPdfOpen('new-tab')
                }}
              >
                Открыть PDF
              </a>
              <a className="policy-page-link" href="/">
                Вернуться в Тайничок
              </a>
            </div>
          </article>

          <section className="policy-page-grid">
            {premiumTermsSections.map((section) => (
              <article key={section.title} className="policy-page-section">
                <h2>{section.title}</h2>

                {section.blocks.map((block) =>
                  block.type === 'paragraph' ? (
                    <p key={block.content}>{block.content}</p>
                  ) : (
                    <ul className="policy-page-list" key={block.items.join('|')}>
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                )}
              </article>
            ))}
          </section>

          <footer className="policy-page-footer">
            <span className="policy-page-caption">
              На странице размещён полный текст документа, а PDF-версия доступна по прямой ссылке.
            </span>
            <a
              className="policy-page-button"
              href={premiumTermsPdfPath}
              download="Условия Premium. Тайничок.pdf"
              onClick={() => {
                trackPdfOpen('download')
              }}
            >
              Скачать PDF
            </a>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
