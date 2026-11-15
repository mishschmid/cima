import { timingSafeEqual } from 'node:crypto'
import { handleSpikeMessage } from '../../utils/mcp/spike'

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default defineEventHandler(async (event) => {
  const { mcpSpikeSecret } = useRuntimeConfig(event)
  const secret = getRouterParam(event, 'secret') ?? ''

  if (!mcpSpikeSecret || !secretMatches(secret, mcpSpikeSecret)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  // Stateless server: no SSE stream and no sessions.
  if (event.method !== 'POST') {
    setHeader(event, 'allow', 'POST')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }

  const body = await readBody<unknown>(event)

  if (import.meta.dev) console.info('[mcp-spike] request', JSON.stringify(body))

  const messages = Array.isArray(body) ? body : [body]
  const responses = messages.map((msg) => handleSpikeMessage(msg)).filter((r) => r !== null)

  if (responses.length === 0) {
    setResponseStatus(event, 202)
    return null
  }

  setHeader(event, 'content-type', 'application/json')
  return Array.isArray(body) ? responses : responses[0]
})
