/**
 * Common interface for all external service adapters.
 * Each adapter wraps one third-party API.
 */

export interface AdapterResult {
  success: boolean
  data: unknown
  cost: number        // Real cost in USD (approximate)
  description: string // Human-readable summary
}

export interface ServiceAdapter {
  /** Service identifier */
  readonly name: string

  /** Test if credentials are valid */
  testConnection(apiKey: string): Promise<boolean>

  /** Execute an action */
  execute(
    apiKey: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<AdapterResult>

  /** List supported actions */
  getActions(): string[]
}
