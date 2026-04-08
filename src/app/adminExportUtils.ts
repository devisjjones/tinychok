export function confirmStaffIdentifierAction(actorIdentifier: string, promptText: string) {
  const confirmation = window.prompt(promptText, actorIdentifier)
  if (confirmation === null) {
    return false
  }

  return confirmation.trim() === actorIdentifier
}

export function getPromptedActionReason(promptText: string, fallback: string) {
  const reason = window.prompt(promptText, fallback)
  if (reason === null) {
    return null
  }

  return reason.trim() || fallback
}

export function getPromptedCurrentPassword(promptText: string) {
  const password = window.prompt(promptText, '')
  if (password === null) {
    return null
  }

  return password.length > 0 ? password : null
}
