import assert from 'node:assert/strict'
import test from 'node:test'

import {
  captchaVerificationRequiredMessage,
  normalizePasswordLoginFailureMessage,
  passwordLoginCaptchaRequiredMessage,
  shouldActivatePasswordLoginCaptcha,
} from '../../src/app/authAnalytics'

test('password login normalizes generic captcha verification failures into the password-specific prompt', () => {
  assert.equal(shouldActivatePasswordLoginCaptcha(captchaVerificationRequiredMessage), true)
  assert.equal(
    normalizePasswordLoginFailureMessage(captchaVerificationRequiredMessage),
    passwordLoginCaptchaRequiredMessage,
  )
})

test('password login keeps the explicit password captcha prompt stable', () => {
  assert.equal(shouldActivatePasswordLoginCaptcha(passwordLoginCaptchaRequiredMessage), true)
  assert.equal(
    normalizePasswordLoginFailureMessage(passwordLoginCaptchaRequiredMessage),
    passwordLoginCaptchaRequiredMessage,
  )
})

test('password login leaves unrelated failures unchanged', () => {
  assert.equal(shouldActivatePasswordLoginCaptcha('Неверный пароль.'), false)
  assert.equal(normalizePasswordLoginFailureMessage('Неверный пароль.'), 'Неверный пароль.')
})
