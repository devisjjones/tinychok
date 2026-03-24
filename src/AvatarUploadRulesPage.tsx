import { useCookieConsent } from './app/useCookieConsent'
import { CookieConsentBanner } from './components/CookieConsentBanner'

const avatarUploadRulesUpdatedAt = '24 марта 2026'

const avatarUploadRules = [
  {
    title: 'Что можно загружать',
    items: [
      'Аватарка должна принадлежать вам либо использоваться на законных основаниях.',
      'Допускаются нейтральные портреты, иллюстрации, логотипы и другие изображения, которые не нарушают закон и правила Tinychok.',
      'Изображение должно быть безопасным для публичного показа другим пользователям сервиса.',
    ],
  },
  {
    title: 'Что запрещено',
    items: [
      'Нельзя загружать наготу, порнографию, сексуализированные изображения несовершеннолетних и иной контент сексуального характера.',
      'Нельзя загружать изображения с насилием, расчленением, призывами к жестокости, экстремизму, терроризму или другой запрещённой тематикой.',
      'Нельзя использовать аватарки для травли, угроз, дискриминации, выдачи себя за другое лицо, мошенничества или обхода блокировок.',
      'Нельзя загружать материалы, нарушающие авторские, смежные или иные права третьих лиц.',
    ],
  },
  {
    title: 'Ответственность пользователя',
    items: [
      'Пользователь самостоятельно отвечает за содержание загружаемой аватарки и за законность её использования.',
      'Сервис Tinychok не несёт ответственность за контент, который пользователь загружает в качестве аватарки, но вправе проверять его на соответствие правилам платформы.',
      'По запросу государственных органов, правообладателей или иных уполномоченных лиц контент может быть удалён, а доступ к аккаунту ограничен.',
    ],
  },
  {
    title: 'Действия Tinychok',
    items: [
      'Tinychok вправе удалить аватарку без предварительного уведомления, если она нарушает закон, правила сервиса или права третьих лиц.',
      'При серьёзном или повторном нарушении Tinychok вправе временно ограничить функции аккаунта или полностью заблокировать пользователя.',
      'Мы также можем отказать в публикации или хранении изображения, если оно выглядит небезопасным, сомнительным или неприемлемым для публичного сервиса.',
    ],
  },
]

export function AvatarUploadRulesPage() {
  const { cookieConsent, updateCookieConsent } = useCookieConsent()

  return (
    <>
      <main className="policy-page">
        <section className="policy-page-shell">
          <article className="policy-page-panel">
            <div className="policy-page-topline">
              <div>
                <p className="eyebrow">Tinychok</p>
                <h1 className="policy-page-title">Правила загрузки аватарки</h1>
              </div>
              <div className="policy-page-badge">Редакция от {avatarUploadRulesUpdatedAt}</div>
            </div>

            <p className="policy-page-copy">
              Загружая аватарку в Tinychok, пользователь подтверждает, что имеет право использовать
              изображение и понимает ответственность за его содержание. Ниже приведены базовые
              правила для MVP-версии сервиса.
            </p>

            <div className="policy-page-actions">
              <a className="policy-page-link" href="/">
                Вернуться в Тайничок
              </a>
              <a className="policy-page-link" href="/user-agreement.html">
                Пользовательское соглашение
              </a>
            </div>
          </article>

          <article className="policy-page-callout">
            <p className="eyebrow">Важно</p>
            <p>
              Правила относятся к аватаркам пользователя, каналов и групп. Они дополняют
              пользовательское соглашение Tinychok и действуют вместе с ним.
            </p>
            <p>
              Если изображение нарушает эти правила или законодательство, оно может быть удалено,
              а аккаунт пользователя может быть ограничен или заблокирован.
            </p>
          </article>

          <section className="policy-page-grid">
            {avatarUploadRules.map((section) => (
              <article key={section.title} className="policy-page-section">
                <h2>{section.title}</h2>
                <ul className="policy-page-list">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <footer className="policy-page-footer">
            <span className="policy-page-caption">
              Это базовая версия правил загрузки аватарок для текущего этапа Tinychok. Позже текст
              может быть дополнен отдельной модерационной политикой.
            </span>
            <a className="policy-page-link" href="/user-agreement.html">
              Открыть пользовательское соглашение
            </a>
          </footer>
        </section>
      </main>
      <CookieConsentBanner consent={cookieConsent} onChoice={updateCookieConsent} />
    </>
  )
}
