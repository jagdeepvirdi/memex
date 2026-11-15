// One mapping from "something went wrong in an on-demand AI action" to a status and a message the user can act on.
// Used by the request/response routes (extract recipe) and by background jobs (explain), which have no HTTP
// response and store the message on the job instead.

import { AiProviderError } from './ai.js'
import { ExplainParseError } from './explainService.js'
import { NoSourceTextError } from './itemSource.js'

export interface ActionErrorInfo {
  /** HTTP status when this happens in a request. */
  status: number
  /** Safe to show the user. */
  message: string
  /** Machine-readable reason, when there is one (provider failures). */
  kind?: string
  provider?: string
}

/** Returns null for errors that are not expected failures (the caller logs those and shows a generic message). */
export function describeActionError(err: unknown): ActionErrorInfo | null {
  if (err instanceof NoSourceTextError) return { status: 422, message: err.message }
  if (err instanceof ExplainParseError) return { status: 502, message: err.message }
  if (err instanceof AiProviderError) {
    const status = err.kind === 'blocked' ? 409 : err.kind === 'rate_limit' ? 429 : err.kind === 'timeout' ? 504 : 502
    return { status, message: err.message, kind: err.kind, provider: err.provider }
  }
  if (err instanceof Error && /Strict Local Mode/i.test(err.message)) return { status: 409, message: err.message }
  return null
}

/** The JSON body a route sends for an expected failure (same shape the routes always used). */
export function actionErrorBody(info: ActionErrorInfo): Record<string, unknown> {
  return { error: info.message, ...(info.provider ? { provider: info.provider } : {}), ...(info.kind ? { kind: info.kind } : {}) }
}
