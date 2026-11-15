// Minimal stateless MCP server for the Gemini watch spike (docs/tasks/09-gemini-mcp.md, 9.0).
// Returns a fixed reply and touches no user data.

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const NAME_HINT =
  'Speech recognition often mishears the name "Cima" (pronounced "Chee-ma") as ' +
  '"Jima", "Chima", "Sima", "Gima", "Cheema", "Tschima" or "Kima"; treat all of these as Cima. ' +
  'Also use this tool when the user says "ask my companion".'

const ASK_CIMA_TOOL = {
  name: 'ask_cima',
  title: 'Ask Cima',
  description:
    "Send the user's message to Cima, their personal companion, and get Cima's reply. " +
    "Pass the user's words unchanged and read the reply to the user verbatim. " +
    NAME_HINT,
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: "The user's message to Cima, unchanged." },
    },
    required: ['message'],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}

function formatTime(now: Date): string {
  return now.toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  })
}

function result(id: JsonRpcRequest['id'], value: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result: value }
}

function error(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

/** Handles one JSON-RPC message. Returns null for notifications (no response). */
export function handleSpikeMessage(msg: unknown, now = new Date()): JsonRpcResponse | null {
  if (!msg || typeof msg !== 'object' || (msg as JsonRpcRequest).jsonrpc !== '2.0') {
    return error(null, -32600, 'Invalid Request')
  }

  const { id, method, params } = msg as JsonRpcRequest
  const isNotification = id === undefined

  if (typeof method !== 'string') return error(id, -32600, 'Invalid Request')
  if (isNotification) return null

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      const protocolVersion =
        typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0]
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cima', title: 'Cima', version: '0.0.1-spike' },
        instructions:
          'Use ask_cima whenever the user addresses Cima ("ask Cima", "tell Cima", "Cima, …"). ' +
          NAME_HINT,
      })
    }
    case 'ping':
      return result(id, {})
    case 'tools/list':
      return result(id, { tools: [ASK_CIMA_TOOL] })
    case 'tools/call': {
      if (params?.name !== ASK_CIMA_TOOL.name) {
        return error(id, -32602, `Unknown tool: ${String(params?.name)}`)
      }
      const args = params.arguments as { message?: unknown } | undefined
      const message = typeof args?.message === 'string' ? args.message.trim().slice(0, 1000) : ''
      if (!message) {
        return result(id, {
          content: [{ type: 'text', text: 'Missing message.' }],
          isError: true,
        })
      }
      return result(id, {
        content: [
          {
            type: 'text',
            text: `Cima here. You said: ${message}. Time on the server: ${formatTime(now)}.`,
          },
        ],
      })
    }
    default:
      return error(id, -32601, `Method not found: ${method}`)
  }
}
