type ConfirmLogoutScreenProps = {
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmLogoutScreen({ onCancel, onConfirm }: ConfirmLogoutScreenProps) {
  return (
    <main className="confirm-shell">
      <section className="confirm-card">
        <p className="eyebrow">Выход</p>
        <h2>Вы точно хотите выйти из аккаунта?</h2>
        <p className="confirm-copy">
          Сессия закроется на этом устройстве. Чтобы вернуться, нужно будет снова войти по номеру
          телефона.
        </p>
        <div className="confirm-actions">
          <button type="button" className="send-button confirm-stay" onClick={onCancel}>
            Остаться
          </button>
          <button type="button" className="soft-button confirm-exit" onClick={onConfirm}>
            Выйти
          </button>
        </div>
      </section>
    </main>
  )
}
