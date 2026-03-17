/**
 * Custom error types for the Hub.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'AuthError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class CredentialError extends AppError {
  constructor(service: string) {
    super(
      `No ${service} credentials configured for this tenant. Use /connect to add your API key.`,
      'CREDENTIAL_MISSING',
      400
    )
    this.name = 'CredentialError'
  }
}
