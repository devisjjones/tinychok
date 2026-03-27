import type { Account, AuthStep } from '../app/types'
import { formatAccountName } from '../app/utils'
import { useState, type RefObject } from 'react'

type AuthScreenProps = {
  authCodeFlow: 'password-reset' | 'password-setup' | 'registration'
  authError: string
  authExistingAccount: Pick<Account, 'displayName' | 'surname'> | null
  authStep: AuthStep
  captchaBusy: boolean
  captchaContainerRef: RefObject<HTMLDivElement | null>
  captchaPlacement: 'phone' | 'password' | null
  captchaProvider: 'disabled' | 'turnstile' | 'smartcaptcha'
  displayName: string
  displayNameMaxLength: number
  identifier: string
  password: string
  passwordConfirm: string
  passwordMinLength: number
  smsCode: string
  onDisplayNameChange: (value: string) => void
  onForgotPassword: () => void
  onIdentifierChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onPasswordConfirmChange: (value: string) => void
  onSupportEmailClick: () => void
  onSmsCodeChange: (value: string) => void
  onSubmit: () => void
}

export function AuthScreen({
  authCodeFlow,
  authError,
  authExistingAccount,
  authStep,
  captchaBusy,
  captchaContainerRef,
  captchaPlacement,
  captchaProvider,
  displayName,
  displayNameMaxLength,
  identifier,
  password,
  passwordConfirm,
  passwordMinLength,
  smsCode,
  onDisplayNameChange,
  onForgotPassword,
  onIdentifierChange,
  onPasswordChange,
  onPasswordConfirmChange,
  onSupportEmailClick,
  onSmsCodeChange,
  onSubmit,
}: AuthScreenProps) {
  const isPasswordStep = authStep === 'password'
  const isCodeStep = authStep === 'code'
  const isProfilePasswordStep = authStep === 'profile-password'
  const isPasswordSetupStep = authStep === 'password-setup'
  const isPasswordResetStep = authStep === 'password-reset'
  const isPhoneStep = authStep === 'phone'
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [passwordConfirmVisible, setPasswordConfirmVisible] = useState(false)

  function renderPasswordField({
    autoComplete,
    label,
    onChange,
    placeholder,
    value,
    visible,
    onToggleVisible,
  }: {
    autoComplete: string
    label: string
    onChange: (value: string) => void
    placeholder: string
    value: string
    visible: boolean
    onToggleVisible: () => void
  }) {
    return (
      <label className="auth-field">
        <span>{label}</span>
        <div className="auth-password-input">
          <input
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            className="auth-password-visibility"
            onClick={onToggleVisible}
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          >
            <img
              src={visible ? '/icons/eyeoff.png' : '/icons/eyeon.png'}
              alt=""
              aria-hidden="true"
            />
          </button>
        </div>
      </label>
    )
  }

  const submitLabel =
    authStep === 'phone'
      ? authCodeFlow === 'password-reset'
        ? 'Получить код для сброса'
        : 'Продолжить'
      : authStep === 'password'
        ? 'Войти'
        : authStep === 'code'
          ? authCodeFlow === 'password-reset'
            ? 'Подтвердить номер'
            : authExistingAccount
              ? 'Подтвердить вход'
              : 'Подтвердить номер'
          : authStep === 'profile-password'
            ? 'Создать тайник'
            : authStep === 'password-setup'
              ? 'Сохранить пароль и войти'
              : 'Задать новый пароль'

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
          {isProfilePasswordStep ? (
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

          {isPhoneStep ? (
            <>
              {authCodeFlow === 'password-reset' ? (
                <div className="auth-code-note">
                  <span className="settings-label">Подтвердите номер для сброса пароля</span>
                  <strong>{identifier || '+79990000000'}</strong>
                </div>
              ) : null}
              <label className="auth-field">
                <span>Номер телефона</span>
                <input
                  type="tel"
                  placeholder="+79990000000"
                  value={identifier}
                  onChange={(event) => onIdentifierChange(event.target.value)}
                />
              </label>
            </>
          ) : null}

          {isPasswordStep ? (
            <>
              {authExistingAccount ? (
                <p className="auth-returning-title">
                  С возвращением, {formatAccountName(authExistingAccount)}
                </p>
              ) : null}
              <div className="auth-code-note">
                <span className="settings-label">Вход по паролю для номера</span>
                <strong>{identifier}</strong>
              </div>
              {renderPasswordField({
                autoComplete: 'current-password',
                label: 'Пароль',
                onChange: onPasswordChange,
                onToggleVisible: () => setPasswordVisible((current) => !current),
                placeholder: 'Введите пароль',
                value: password,
                visible: passwordVisible,
              })}
              <button
                type="button"
                className="auth-secondary-action"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onForgotPassword()
                }}
              >
                Забыли пароль?
              </button>
            </>
          ) : null}

          {isCodeStep ? (
            <>
              {authExistingAccount ? (
                <p className="auth-returning-title">
                  С возвращением, {formatAccountName(authExistingAccount)}
                </p>
              ) : null}
              <div className="auth-code-note">
                <span className="settings-label">
                  {authCodeFlow === 'password-reset'
                    ? 'Подтвердите номер через SMS'
                    : 'Код отправлен на номер'}
                </span>
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

          {isProfilePasswordStep || isPasswordSetupStep || isPasswordResetStep ? (
            <>
              {renderPasswordField({
                autoComplete: 'new-password',
                label: 'Пароль',
                onChange: onPasswordChange,
                onToggleVisible: () => setPasswordVisible((current) => !current),
                placeholder: `Минимум ${passwordMinLength} символов`,
                value: password,
                visible: passwordVisible,
              })}
              {renderPasswordField({
                autoComplete: 'new-password',
                label: 'Подтвердите пароль',
                onChange: onPasswordConfirmChange,
                onToggleVisible: () => setPasswordConfirmVisible((current) => !current),
                placeholder: 'Повторите пароль',
                value: passwordConfirm,
                visible: passwordConfirmVisible,
              })}
            </>
          ) : null}

          {authError ? <p className="auth-error">{authError}</p> : null}

          {captchaPlacement && captchaProvider === 'smartcaptcha' ? (
            <div className="auth-captcha">
              <div ref={captchaContainerRef} className="auth-captcha-widget" aria-hidden="true" />
              <p className="auth-captcha-note">
                {captchaPlacement === 'password'
                  ? 'После нескольких неудачных попыток подтвердите, что вы не робот, чтобы продолжить вход по паролю.'
                  : 'Вход защищён SmartCaptcha. Перед продолжением подтвердите, что вы не робот.'}
              </p>
            </div>
          ) : null}

          <button type="submit" className="send-button auth-submit" disabled={captchaBusy}>
            {submitLabel}
          </button>

          {isPhoneStep ? (
            <p className="auth-submit-note">
              Продолжая авторизацию, вы соглашаетесь с{' '}
              <a className="auth-submit-note-link" href="/user-agreement.html">
                Пользовательским соглашением
              </a>{' '}
              и{' '}
              <a className="auth-submit-note-link" href="/privacy-policy.html">
                Политикой обработки персональных данных
              </a>
              ,{' '}
              <a className="auth-submit-note-link" href="/contacts.html">
                Контактами и реквизитами
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
