import { Buffer } from 'node:buffer'

type YooKassaConfig = {
  publicReturnUrl: string
  receiptTimezone: number
  receiptVatCode: number
  receiptsEnabled: boolean
  secretKey: string
  shopId: string
}

export type YooKassaPaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled'

export type YooKassaPayment = {
  amount: {
    currency: string
    value: string
  }
  cancellation_details?: {
    party?: string
    reason?: string
  }
  confirmation?: {
    confirmation_token?: string
    confirmation_url?: string
    type?: string
  }
  created_at: string
  description?: string
  id: string
  metadata?: Record<string, string>
  paid: boolean
  refundable?: boolean
  status: YooKassaPaymentStatus
  test?: boolean
}

export type YooKassaRefund = {
  amount: {
    currency: string
    value: string
  }
  created_at: string
  id: string
  payment_id: string
  status: 'pending' | 'succeeded' | 'canceled'
}

type CreatePremiumYooKassaPaymentInput = {
  amountValue: string
  description: string
  purchaseId: string
  receiptEmail?: string
  targetIdentifier: string
  ownerIdentifier: string
  plan: 'month' | 'year'
}

class YooKassaApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'YooKassaApiError'
    this.status = status
  }
}

function getYooKassaAuthorizationHeader(config: YooKassaConfig) {
  return `Basic ${Buffer.from(`${config.shopId}:${config.secretKey}`).toString('base64')}`
}

async function parseYooKassaResponse<T>(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const expectsJson = contentType.includes('application/json')
  let payload: Record<string, unknown> | undefined

  if (expectsJson) {
    try {
      payload = (await response.json()) as Record<string, unknown>
    } catch {
      payload = undefined
    }
  } else {
    await response.text()
  }

  if (!response.ok) {
    const description =
      typeof payload?.description === 'string'
        ? payload.description
        : typeof payload?.message === 'string'
          ? payload.message
          : `YooKassa вернула ошибку ${response.status}.`
    throw new YooKassaApiError(description, response.status)
  }

  if (!payload) {
    throw new YooKassaApiError('YooKassa вернула неожиданный пустой ответ.', response.status)
  }

  return payload as T
}

async function sendYooKassaRequest<T>(
  config: YooKassaConfig,
  pathname: string,
  options: {
    body?: Record<string, unknown>
    idempotenceKey?: string
    method?: 'GET' | 'POST'
  } = {},
) {
  const response = await fetch(`https://api.yookassa.ru/v3${pathname}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      Authorization: getYooKassaAuthorizationHeader(config),
      ...(options.idempotenceKey ? { 'Idempotence-Key': options.idempotenceKey } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    method: options.method ?? (options.body ? 'POST' : 'GET'),
  })

  return parseYooKassaResponse<T>(response)
}

export async function createPremiumYooKassaPayment(
  config: YooKassaConfig,
  input: CreatePremiumYooKassaPaymentInput,
) {
  const returnUrl = new URL(config.publicReturnUrl)
  returnUrl.searchParams.set('premiumCheckout', input.purchaseId)

  const body: Record<string, unknown> = {
    amount: {
      currency: 'RUB',
      value: input.amountValue,
    },
    capture: true,
    confirmation: {
      return_url: returnUrl.toString(),
      type: 'redirect',
    },
    description: input.description,
    metadata: {
      ownerIdentifier: input.ownerIdentifier,
      plan: input.plan,
      purchaseId: input.purchaseId,
      targetIdentifier: input.targetIdentifier,
    },
  }

  if (config.receiptsEnabled) {
    const normalizedReceiptEmail = input.receiptEmail?.trim()
    if (!normalizedReceiptEmail) {
      throw new Error('Укажите email для чека ЮKassa.')
    }

    body.receipt = {
      customer: {
        email: normalizedReceiptEmail,
      },
      internet: 'true',
      items: [
        {
          amount: {
            currency: 'RUB',
            value: input.amountValue,
          },
          description: input.description,
          payment_mode: 'full_prepayment',
          payment_subject: 'service',
          quantity: 1,
          vat_code: config.receiptVatCode,
        },
      ],
      timezone: config.receiptTimezone,
    }
  }

  return sendYooKassaRequest<YooKassaPayment>(config, '/payments', {
    body,
    idempotenceKey: input.purchaseId,
    method: 'POST',
  })
}

export async function getYooKassaPayment(config: YooKassaConfig, paymentId: string) {
  return sendYooKassaRequest<YooKassaPayment>(
    config,
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: 'GET' },
  )
}

export async function createYooKassaRefund(
  config: YooKassaConfig,
  input: {
    amountValue: string
    description: string
    paymentId: string
    refundId: string
  },
) {
  return sendYooKassaRequest<YooKassaRefund>(config, '/refunds', {
    body: {
      amount: {
        currency: 'RUB',
        value: input.amountValue,
      },
      description: input.description,
      payment_id: input.paymentId,
    },
    idempotenceKey: input.refundId,
    method: 'POST',
  })
}
