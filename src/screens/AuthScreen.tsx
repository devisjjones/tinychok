import type { Account, AuthStep } from '../app/types'
import { formatAccountName } from '../app/utils'
import type { RefObject } from 'react'

type AuthScreenProps = {
  authError: string
  authExistingAccount: Pick<Account, 'displayName' | 'surname'> | null
  authStep: AuthStep
  captchaBusy: boolean
  captchaContainerRef: RefObject<HTMLDivElement | null>
  captchaProvider: 'disabled' | 'turnstile' | 'smartcaptcha'
  captchaRequired: boolean
  displayName: string
  displayNameMaxLength: number
  identifier: string
  smsCode: string
  onDisplayNameChange: (value: string) => void
  onIdentifierChange: (value: string) => void
  onSupportEmailClick: () => void
  onSmsCodeChange: (value: string) => void
  onSubmit: () => void
}

export function AuthScreen({
  authError,
  authExistingAccount,
  authStep,
  captchaBusy,
  captchaContainerRef,
  captchaProvider,
  captchaRequired,
  displayName,
  displayNameMaxLength,
  identifier,
  smsCode,
  onDisplayNameChange,
  onIdentifierChange,
  onSupportEmailClick,
  onSmsCodeChange,
  onSubmit,
}: AuthScreenProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel auth-promo">
        <p className="eyebrow">Тайничок</p>
        <h1>Тихое общение без лишнего шума</h1>
        <p className="auth-copy">
          Тайничок создан для личных разговоров. Здесь по умолчанию включена тишина:
          без рекламных пушей, без баннеров, без навязчивых рассылок и случайных массовых сообщений.
        </p>
        <div className="hero-stats">
          <div>
            <strong>Тишина</strong>
            <span>включена по умолчанию</span>
          </div>
          <div>
            <strong>0 рекламы</strong>
            <span>никаких баннеров и рассылок</span>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-card">
        <div className="auth-card-brand">
          <p className="eyebrow">Тайничок</p>
          <h2>Тихое общение без лишнего шума</h2>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          {authStep === 'profile' ? (
            <label className="auth-field">
              <span>Имя в Тайничке</span>
              <input
                type="text"
                placeholder="Например, Луна"
                value={displayName}
                maxLength={displayNameMaxLength}
                onChange={(event) => onDisplayNameChange(event.target.value)}
              />
            </label>
          ) : null}

          {authStep === 'phone' ? (
            <label className="auth-field">
              <span>Номер телефона</span>
              <input
                type="tel"
                placeholder="+79990000000"
                value={identifier}
                onChange={(event) => onIdentifierChange(event.target.value)}
              />
            </label>
          ) : null}

          {authStep === 'code' ? (
            <>
              {authExistingAccount ? (
                <p className="auth-returning-title">
                  С возвращением, {formatAccountName(authExistingAccount)}
                </p>
              ) : null}
              <div className="auth-code-note">
                <span className="settings-label">Код отправлен на номер</span>
                <strong>{identifier}</strong>
              </div>
              <label className="auth-field">
                <span>Код из SMS</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Например, 4821"
                  value={smsCode}
                  onChange={(event) => onSmsCodeChange(event.target.value)}
                />
              </label>
            </>
          ) : null}

          {authError ? <p className="auth-error">{authError}</p> : null}

          {authStep === 'phone' && captchaRequired && captchaProvider === 'smartcaptcha' ? (
            <div className="auth-captcha">
              <div ref={captchaContainerRef} className="auth-captcha-widget" aria-hidden="true" />
              <p className="auth-captcha-note">
                Вход защищён SmartCaptcha. Перед продолжением подтвердите, что вы не робот.
              </p>
            </div>
          ) : null}

          <button type="submit" className="send-button auth-submit" disabled={captchaBusy}>
            {authStep === 'phone'
              ? 'Получить код'
              : authStep === 'code'
                ? authExistingAccount
                  ? 'Подтвердить вход'
                  : 'Подтвердить номер'
                : 'Создать тайник'}
          </button>

          {authStep === 'phone' ? (
            <p className="auth-submit-note">
              Продолжая авторизацию, вы соглашаетесь с{' '}
              <a className="auth-submit-note-link" href="/user-agreement.html">
                Пользовательским соглашением
              </a>{' '}
              и{' '}
              <a className="auth-submit-note-link" href="/privacy-policy.html">
                Политикой обработки персональных данных
              </a>
              .
            </p>
          ) : null}
        </form>
      </section>

      <footer className="auth-support-footer">
        <span className="auth-support-label">Не получается войти в Тайничок?</span>
        <a
          className="auth-support-link"
          href="mailto:tinychok.help@yandex.com"
          onClick={onSupportEmailClick}
        >
          tinychok.help@yandex.com
        </a>
      </footer>
    </main>
  )
}
