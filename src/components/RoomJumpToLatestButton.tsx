type RoomJumpToLatestButtonProps = {
  onClick: () => void
}

export function RoomJumpToLatestButton({ onClick }: RoomJumpToLatestButtonProps) {
  return (
    <div className="room-jump-to-latest-wrap">
      <button
        type="button"
        className="soft-button room-jump-to-latest"
        onClick={onClick}
        aria-label="К последним сообщениям"
        title="К последним сообщениям"
      >
        <span className="room-jump-to-latest-icon" aria-hidden="true">↓</span>
      </button>
    </div>
  )
}
