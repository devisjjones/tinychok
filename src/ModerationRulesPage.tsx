import { useCookieConsent } from './app/useCookieConsent'
import { usePublicLegalAnalytics } from './app/usePublicLegalAnalytics'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import {
  moderationRulesComplaintNotice,
  moderationRulesLead,
  moderationRulesSections,
  moderationRulesTitle,
  moderationRulesUpdatedAt,
} from './moderationRulesContent'

// Public compliance page for moderation handling. Keep copy synced with the approved document.
export function ModerationRulesPage() {
  const { analyticsConsentGranted, cookieConsent, updateCookieConsent } = useCookieConsent()
  usePublicLegalAnalytics({
    analyticsConsentGranted,
    document: 'moderation-rules',
  })

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">{moderationRulesTitle}</h1>
              </div>
              <div className="policy-page-badge">Редакция от {moderationRulesUpdatedAt}</div>
            </div>

            <p className="policy-page-copy">{moderationRulesLead}</p>

            <div className="policy-page-actions">
              <a className="policy-page-link" href="/contacts.html">
                Контакты и реквизиты
              </a>
              <a className="policy-page-link" href="/user-agreement.html">
                Пользовательское соглашение
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
            <h2>Как пожаловаться или обжаловать меру</h2>
            <p>{moderationRulesComplaintNotice}</p>
            <a className="policy-page-button" href="mailto:tinychok.help@yandex.com">
              Написать в поддержку
            </a>
          </article>

          <section className="policy-page-grid">
            {moderationRulesSections.map((section) => (
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
              Публичная ссылка для страницы с правилами модерации:{' '}
              <strong>/moderation-rules.html</strong>
            </span>
            <a className="policy-page-link" href="mailto:tinychok.help@yandex.com">
              Подать жалобу или апелляцию
            </a>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
