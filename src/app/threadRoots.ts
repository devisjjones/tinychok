export function hasUsableThreadRoot(
  root:
    | {
        threadArchivedAt?: string | null
      }
    | null
    | undefined,
) {
  if (!root) {
    return false
  }

  return !root.threadArchivedAt
}
