import { useCookieConsent } from './app/useCookieConsent'
import { CookieConsentBanner } from './components/CookieConsentBanner'

const contactsUpdatedAt = '26 марта 2026'

const contactCards = [
  {
    title: 'Оператор сервиса',
    rows: [
      'ИП Мерзляков Алексей Сергеевич',
      'ИНН: 100485269510',
      'ОГРНИП: 326774600067696',
    ],
  },
  {
    title: 'Контакты для связи',
    rows: [
      'Служба поддержки: tinychok.help@yandex.com',
      'Общие юридические вопросы: devisjjones@gmail.com',
      'Адрес регистрации: г. Москва, ул. Перовское шоссе, д. 2, к. 2, кв. 640',
    ],
  },
  {
    title: 'Информация об оплате и доступе',
    rows: [
      'Tinychok предоставляет цифровой доступ к функциям сервиса и premium-возможностям.',
      'Физическая доставка товаров не осуществляется.',
      'Доступ к цифровому продукту и premium-функциям активируется онлайн после успешной оплаты.',
    ],
  },
]

export function ContactsPage() {
  const { cookieConsent, updateCookieConsent } = useCookieConsent()

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">Контакты и реквизиты</h1>
              </div>
              <div className="policy-page-badge">Редакция от {contactsUpdatedAt}</div>
            </div>

            <p className="policy-page-copy">
              Эта страница опубликована для пользователей сервиса, платёжных провайдеров и
              партнёров. Здесь собраны публичные контакты Tinychok, данные оператора сервиса и
              базовая информация о получении цифрового доступа.
            </p>

            <div className="policy-page-actions">
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
            <p className="eyebrow">Для YooKassa</p>
            <p>
              Если платёжный провайдер проверяет сайт вручную, в качестве страницы с реквизитами
              можно указывать именно этот публичный URL.
            </p>
            <p>
              На странице указаны ИНН, ОГРНИП, контакты для связи и способ получения цифрового
              продукта после оплаты.
            </p>
          </article>

          <section className="policy-page-grid">
            {contactCards.map((card) => (
              <article key={card.title} className="policy-page-section">
                <h2>{card.title}</h2>
                <ul className="policy-page-list">
                  {card.rows.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <footer className="policy-page-footer">
            <span className="policy-page-caption">
              Публичная ссылка для страницы с реквизитами: <strong>/contacts.html</strong>
            </span>
            <a className="policy-page-link" href="mailto:tinychok.help@yandex.com">
              Написать в поддержку
            </a>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
