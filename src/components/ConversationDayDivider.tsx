type ConversationDayDividerProps = {
  label: string
}

export function ConversationDayDivider({ label }: ConversationDayDividerProps) {
  return (
    <div className="conversation-day-divider" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  )
}
