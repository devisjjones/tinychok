import { useEffect } from 'react'

const defaultStaleRuntimeRecoveryIntervalMs = 60_000

export type RuntimeSessionRecoveryReason = 'focus' | 'pageshow' | 'visibilitychange'

type UseRuntimeSessionRecoveryArgs = {
  backendReady: boolean
  latestAuthoritativeSnapshotAtRef: { current: number }
  refreshVisibleSessionSnapshot: (reason: RuntimeSessionRecoveryReason) => Promise<void>
  sessionToken?: string | null
  staleRuntimeRecoveryIntervalMs?: number
}

export function useRuntimeSessionRecovery({
  backendReady,
  latestAuthoritativeSnapshotAtRef,
  refreshVisibleSessionSnapshot,
  sessionToken,
  staleRuntimeRecoveryIntervalMs = defaultStaleRuntimeRecoveryIntervalMs,
}: UseRuntimeSessionRecoveryArgs) {
  useEffect(() => {
    if (!sessionToken || typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const shouldRecoverStaleRuntime = (force = false) => {
      if (document.visibilityState !== 'visible') {
        return false
      }

      if (force || !backendReady) {
        return true
      }

      return Date.now() - latestAuthoritativeSnapshotAtRef.current >= staleRuntimeRecoveryIntervalMs
    }

    const recoverIfNeeded = (reason: RuntimeSessionRecoveryReason, force = false) => {
      if (!shouldRecoverStaleRuntime(force)) {
        return
      }

      void refreshVisibleSessionSnapshot(reason)
    }

    const handlePageshow = (event: PageTransitionEvent) => {
      const navigationEntry = window.performance.getEntriesByType('navigation')[0]
      const restoredFromHistory =
        typeof PerformanceNavigationTiming !== 'undefined' &&
        navigationEntry instanceof PerformanceNavigationTiming &&
        navigationEntry.type === 'back_forward'

      if (event.persisted || restoredFromHistory) {
        recoverIfNeeded('pageshow', true)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverIfNeeded('visibilitychange')
      }
    }

    const handleFocus = () => {
      recoverIfNeeded('focus')
    }

    window.addEventListener('pageshow', handlePageshow)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handlePageshow)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    backendReady,
    latestAuthoritativeSnapshotAtRef,
    refreshVisibleSessionSnapshot,
    sessionToken,
    staleRuntimeRecoveryIntervalMs,
  ])
}
