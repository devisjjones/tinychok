import { useCookieConsent } from './app/useCookieConsent'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import {
  userAgreementLead,
  userAgreementSections,
  userAgreementUpdatedAt,
} from './userAgreementContent'

export function UserAgreementPage() {
  const { cookieConsent, updateCookieConsent } = useCookieConsent()

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

            <p className="policy-page-copy">{userAgreementLead}</p>

            <div className="policy-page-actions">
              <a className="policy-page-link" href="/contacts.html">
                Контакты и реквизиты
              </a>
              <a className="policy-page-link" href="/privacy-policy.html">
                Политика данных
              </a>
              <a className="policy-page-link" href="/">
                Вернуться в Тайничок
              </a>
            </div>
          </article>

          <article className="policy-page-callout">
            <p className="eyebrow">Важно</p>
            <p>
              Это соглашение применяется к авторизации по номеру телефона, использованию аккаунта,
              сообщениям, группам, каналам, вложениям и другим функциям Tinychok.
            </p>
            <p>
              Отдельно действует <a href="/privacy-policy.html">Политика обработки персональных данных</a>,
              которая регулирует порядок обработки и защиты данных пользователей.
            </p>
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
              На странице размещён полный текст пользовательского соглашения Tinychok.
            </span>
            <a className="policy-page-link" href="/privacy-policy.html">
              Открыть политику данных
            </a>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
