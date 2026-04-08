export type ActiveRoomReadTarget = {
  kind: 'channel' | 'chat' | 'group'
  id: number
  unread: number
}

export function getActiveRoomReadKey(target: ActiveRoomReadTarget | null) {
  return target ? `${target.kind}:${target.id}` : null
}

export function shouldSyncActiveRoomRead(options: {
  documentVisible: boolean
  syncInFlightRoomKey: string | null
  target: ActiveRoomReadTarget | null
}) {
  const { documentVisible, syncInFlightRoomKey, target } = options
  if (!target || !documentVisible || target.unread <= 0) {
    return false
  }

  return syncInFlightRoomKey !== getActiveRoomReadKey(target)
}
