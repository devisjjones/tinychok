export class HttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export function getErrorStatusCode(error: unknown, fallbackStatusCode = 400) {
  if (error instanceof HttpError) {
    return error.statusCode
  }

  return fallbackStatusCode
}
