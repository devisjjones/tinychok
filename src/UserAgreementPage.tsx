import { useCookieConsent } from './app/useCookieConsent'
import { usePublicLegalAnalytics } from './app/usePublicLegalAnalytics'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import {
  userAgreementIntroBlocks,
  userAgreementPdfPath,
  userAgreementSections,
  userAgreementUpdatedAt,
} from './userAgreementContent'

// Legal pages are public compliance surfaces. Keep links, PDF downloads and top-level copy stable.
export function UserAgreementPage() {
  const { analyticsConsentGranted, cookieConsent, updateCookieConsent } = useCookieConsent()
  const { trackPdfOpen } = usePublicLegalAnalytics({
    analyticsConsentGranted,
    document: 'user-agreement',
  })

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">Пользовательское соглашение</h1>
              </div>
              <div className="policy-page-badge">Редакция от {userAgreementUpdatedAt}</div>
            </div>

            {userAgreementIntroBlocks.map((block) =>
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
              <a className="policy-page-link" href="/contacts.html">
                Контакты и реквизиты
              </a>
              <a
                className="policy-page-button"
                href={userAgreementPdfPath}
                download="Пользовательское соглашение. Тайничок.pdf"
                onClick={() => {
                  trackPdfOpen('download')
                }}
              >
                Скачать
              </a>
              <a
                className="policy-page-link"
                href={userAgreementPdfPath}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  trackPdfOpen('new-tab')
                }}
              >
                Открыть PDF
              </a>
              <a className="policy-page-link" href="/privacy-policy.html">
                Политика данных
              </a>
              <a className="policy-page-link" href="/">
                Вернуться в Тайничок
              </a>
            </div>
          </article>

          <section className="policy-page-grid">
            {userAgreementSections.map((section) => (
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
              href={userAgreementPdfPath}
              download="Пользовательское соглашение. Тайничок.pdf"
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
