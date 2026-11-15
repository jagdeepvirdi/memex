import { describe, it, expect } from 'vitest'
import { describeActionError, actionErrorBody } from './actionErrors'
import { AiProviderError } from './ai'
import { ExplainParseError } from './explainService'
import { NoSourceTextError } from './itemSource'

describe('describeActionError', () => {
  it('maps a missing transcript to 422 and an unusable AI answer to 502', () => {
    expect(describeActionError(new NoSourceTextError('No transcript'))).toEqual({ status: 422, message: 'No transcript' })
    expect(describeActionError(new ExplainParseError())).toMatchObject({ status: 502 })
  })

  it.each([
    ['blocked', 409], ['rate_limit', 429], ['timeout', 504], ['unavailable', 502], ['auth', 502], ['bad_response', 502],
  ] as const)('maps provider failure %s to %i, keeping provider and kind', (kind, status) => {
    expect(describeActionError(new AiProviderError('claude', kind, 'msg'))).toEqual({ status, message: 'msg', kind, provider: 'claude' })
  })

  it('maps Strict Local Mode errors to 409', () => {
    expect(describeActionError(new Error('Strict Local Mode is enabled.'))).toEqual({ status: 409, message: 'Strict Local Mode is enabled.' })
  })

  it('returns null for anything unexpected, so callers log it and show a generic message', () => {
    expect(describeActionError(new Error('ECONNRESET'))).toBeNull()
    expect(describeActionError('boom')).toBeNull()
    expect(describeActionError(undefined)).toBeNull()
  })
})

describe('actionErrorBody', () => {
  it('has the shape the routes always sent', () => {
    expect(actionErrorBody({ status: 422, message: 'No transcript' })).toEqual({ error: 'No transcript' })
    expect(actionErrorBody({ status: 429, message: 'Slow', kind: 'rate_limit', provider: 'gemini' })).toEqual({ error: 'Slow', provider: 'gemini', kind: 'rate_limit' })
  })
})
