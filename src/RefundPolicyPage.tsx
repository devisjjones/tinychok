import { useCallback } from 'react'
import { useCookieConsent } from './app/useCookieConsent'
import { usePublicLegalAnalytics } from './app/usePublicLegalAnalytics'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import {
  refundPolicyEffectiveDate,
  refundPolicyIntroBlocks,
  refundPolicyIntroTitle,
  refundPolicySections,
} from './refundPolicyContent'

// Premium checkout relies on this public page. Keep links and approved refund-policy copy stable.
export function RefundPolicyPage() {
  const { analyticsConsentGranted, cookieConsent, updateCookieConsent } = useCookieConsent()
  usePublicLegalAnalytics({
    analyticsConsentGranted,
    document: 'refund-policy',
  })

  const handleScrollToTop = useCallback(() => {
    if (typeof window === 'undefined') return

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }, [])

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">Политика возвратов</h1>
              </div>
              <div className="policy-page-badge">Дата вступления в силу: {refundPolicyEffectiveDate}</div>
            </div>
          </article>

          <article className="policy-page-callout">
            <h2>{refundPolicyIntroTitle}</h2>
            {refundPolicyIntroBlocks.map((block) =>
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

          <section className="policy-page-grid">
            {refundPolicySections.map((section) => (
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
            <a className="policy-page-link" href="/">
              Вернуться в Тайничок
            </a>
            <button type="button" className="policy-page-button" onClick={handleScrollToTop}>
              Наверх
            </button>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
