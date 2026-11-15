import { describe, expect, it } from 'vitest'
import { handleSpikeMessage } from '../../../server/utils/mcp/spike'

const now = new Date('2026-11-15T09:05:00Z')

describe('MCP spike server', () => {
  it('answers initialize with tools capability and a supported protocol version', () => {
    const res = handleSpikeMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    })
    expect(res?.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'cima' },
    })
  })

  it('falls back to the latest protocol version for unknown versions', () => {
    const res = handleSpikeMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    })
    expect(res?.result).toMatchObject({ protocolVersion: '2025-06-18' })
  })

  it('returns no response for notifications', () => {
    expect(handleSpikeMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  it('lists the read-only ask_cima tool', () => {
    const res = handleSpikeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = (res?.result as { tools: { name: string; annotations: unknown }[] }).tools
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ name: 'ask_cima', annotations: { readOnlyHint: true } })
  })

  it('echoes the message with the Zurich time', () => {
    const res = handleSpikeMessage(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'ask_cima', arguments: { message: '  Hallo Cima ' } },
      },
      now
    )
    expect(res?.result).toEqual({
      content: [
        { type: 'text', text: 'Cima here. You said: Hallo Cima. Time on the server: 10:05.' },
      ],
    })
  })

  it('flags a missing message as a tool error', () => {
    const res = handleSpikeMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'ask_cima', arguments: {} },
    })
    expect(res?.result).toMatchObject({ isError: true })
  })

  it('rejects unknown tools, unknown methods and invalid messages', () => {
    expect(
      handleSpikeMessage({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'x' } })
        ?.error?.code
    ).toBe(-32602)
    expect(handleSpikeMessage({ jsonrpc: '2.0', id: 6, method: 'nope' })?.error?.code).toBe(-32601)
    expect(handleSpikeMessage({ id: 7, method: 'ping' })?.error?.code).toBe(-32600)
  })
})
