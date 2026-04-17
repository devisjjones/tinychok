import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientRuntimeConfigResponse } from '../shared/backend'
import { configureAnalyticsRuntime, trackAnalyticsEvent } from './analytics'
import { fetchClientRuntimeConfig } from './backend'

type PublicLegalDocument =
  | 'contacts'
  | 'moderation-rules'
  | 'premium-terms'
  | 'privacy-policy'
  | 'refund-policy'
  | 'user-agreement'

function getPublicLegalSource() {
  if (typeof document === 'undefined') {
    return 'direct'
  }

  const referrer = document.referrer.trim()
  if (!referrer) {
    return 'direct'
  }

  try {
    const referrerUrl = new URL(referrer)
    if (typeof window !== 'undefined' && referrerUrl.origin === window.location.origin) {
      return 'tinychok'
    }
  } catch {
    return 'external'
  }

  return 'external'
}

export function usePublicLegalAnalytics(args: {
  analyticsConsentGranted: boolean
  document: PublicLegalDocument
}) {
  const { analyticsConsentGranted, document: documentName } = args
  const [runtimeAnalyticsConfig, setRuntimeAnalyticsConfig] =
    useState<ClientRuntimeConfigResponse['analytics'] | null>(null)
  const pageOpenTrackedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrapRuntime() {
      try {
        const runtimeConfig = await fetchClientRuntimeConfig()
        if (cancelled) return
        setRuntimeAnalyticsConfig(runtimeConfig.analytics)
      } catch (error) {
        console.error('Failed to bootstrap public legal analytics runtime', error)
      }
    }

    void bootstrapRuntime()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!runtimeAnalyticsConfig) {
      return
    }

    configureAnalyticsRuntime({
      consentGranted: analyticsConsentGranted,
      enabled: runtimeAnalyticsConfig.enabled,
      flushIntervalMs: runtimeAnalyticsConfig.flushIntervalMs,
      maxBatchSize: runtimeAnalyticsConfig.maxBatchSize,
      metricaCounterId: runtimeAnalyticsConfig.metricaCounterId,
      sessionToken: null,
    })
  }, [analyticsConsentGranted, runtimeAnalyticsConfig])

  useEffect(() => {
    if (!runtimeAnalyticsConfig?.enabled || !analyticsConsentGranted || pageOpenTrackedRef.current) {
      return
    }

    pageOpenTrackedRef.current = true
    trackAnalyticsEvent('legal_page_opened', {
      document: documentName,
      source: getPublicLegalSource(),
    })
  }, [analyticsConsentGranted, documentName, runtimeAnalyticsConfig])

  const trackPdfOpen = useCallback((format: 'download' | 'new-tab') => {
    if (!runtimeAnalyticsConfig?.enabled || !analyticsConsentGranted) {
      return
    }

    trackAnalyticsEvent('legal_pdf_opened', {
      document: documentName,
      format,
      source: getPublicLegalSource(),
    })
  }, [analyticsConsentGranted, documentName, runtimeAnalyticsConfig])

  return {
    trackPdfOpen,
  }
}
