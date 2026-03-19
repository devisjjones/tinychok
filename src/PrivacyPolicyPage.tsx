import {
  privacyPolicyLead,
  privacyPolicyPdfPath,
  privacyPolicySections,
  privacyPolicyUpdatedAt,
} from './privacyPolicyContent'

export function PrivacyPolicyPage() {
  return (
    <main className="policy-page">
      <section className="policy-page-shell">
        <article className="policy-page-panel">
          <div className="policy-page-topline">
            <div>
              <p className="eyebrow">Tinychok</p>
              <h1 className="policy-page-title">
                Политика в отношении обработки персональных данных
              </h1>
            </div>
            <div className="policy-page-badge">Редакция от {privacyPolicyUpdatedAt}</div>
          </div>

          <p className="policy-page-copy">{privacyPolicyLead}</p>

          <div className="policy-page-actions">
            <a
              className="policy-page-button"
              href={privacyPolicyPdfPath}
              download="Политика в отношении обработки персональных данных. Тайничок.pdf"
            >
              Скачать
            </a>
            <a
              className="policy-page-link"
              href={privacyPolicyPdfPath}
              target="_blank"
              rel="noreferrer"
            >
              Открыть PDF
            </a>
            <a className="policy-page-link" href="/">
              Вернуться в Тайничок
            </a>
          </div>
        </article>

        <article className="policy-page-callout">
          <p className="eyebrow">Важно</p>
          <p>
            Политика распространяется на сайт <strong>tinychok.com</strong>, а также на
            связанные с ним сервисы, приложения и функционал мессенджера Tinychok.
          </p>
          <p>
            По вопросам обработки персональных данных и реализации прав субъекта персональных
            данных можно написать на <strong>devisjjones@gmail.com</strong>.
          </p>
        </article>

        <section className="policy-page-grid">
          {privacyPolicySections.map((section) => (
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
            На странице размещён полный текст документа, а PDF-версия хранится в публичной папке
            проекта и доступна по прямой ссылке.
          </span>
          <a
            className="policy-page-button"
            href={privacyPolicyPdfPath}
            download="Политика в отношении обработки персональных данных. Тайничок.pdf"
          >
            Скачать PDF
          </a>
        </footer>
      </section>
    </main>
  )
}
