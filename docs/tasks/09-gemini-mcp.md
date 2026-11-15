# Task 09 – Cima MCP Server for Gemini (Watch via Gemini)

**Goal:** Reach Cima from the Fenix 8 through Gemini. Cima exposes an MCP server; it is added in Gemini as a custom Connector. The watch's voice button opens Gemini (which works, see `07-findings.md`), and Gemini calls Cima as a tool.

```
Fenix 8 button → Gemini → MCP tool ask_cima(message) → Cima turn (memory + child-app tools) → short reply → Gemini speaks it on the watch
```

See [watch-voice-plan.md](../watch-voice-plan.md). Reuses `runChatTurn` and the voice prompt from Task 06 (6.5, 6.6); device tokens and the Android app are not needed for this route.

New dependency allowed by this task: `@modelcontextprotocol/sdk`.

---

## 9.0 Spike (do this first, ~half a day, decides go/no-go)

Prove the voice path end to end before building auth and real tools.

- `server/api/mcp/[secret].post.ts`: a minimal MCP server (Streamable HTTP, stateless) with **one** tool:
  - `ask_cima({ message: string })` → returns a fixed text: `"Cima here. You said: <message>. Time on the server: <HH:mm>."`
  - The route returns `404` unless `secret` equals `runtimeConfig.mcpSpikeSecret` (env `NUXT_MCP_SPIKE_SECRET`, long random value; add to `.env.example`). No user data is touched.
- Deploy to cima.you, add `https://cima.you/api/mcp/<secret>` in Gemini → Connectors → Custom, with no auth.
- Turn on Gemini Apps Activity first (required for custom apps).

Test and record in `docs/tasks/09-findings.md`:

| #   | Test                                                                  | Pass if                                                 |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| G1  | Gemini web: "@Cima ask Cima hello"                                    | The tool is called and the fixed text comes back        |
| G2  | Gemini app on the phone, typed                                        | Same                                                    |
| G3  | Gemini on the phone by **voice** (not Live)                           | Same, answer is spoken                                  |
| G4  | **Watch button**, phone locked: "Ask Cima …" without `@`              | Gemini calls the tool and speaks the reply on the watch |
| G5  | Same in **German**                                                    | Works, or note that custom apps are English-only        |
| G6  | Does Gemini read the tool output **as is**, or rephrase/summarise it? | Note the behaviour                                      |
| G7  | Delay from end of speech to first spoken word, 5 runs                 | Note the numbers (target < 5 s)                         |

G4 decides the route. If it fails (e.g. custom apps don't work from the watch/voice path), stop; the MCP server is still useful for Claude/ChatGPT later, but not for the watch.

## 9.1 Auth (OAuth for MCP)

- Replace the secret URL with proper OAuth, as Gemini expects (Dynamic Client Registration preferred).
- Use better-auth's MCP / OIDC provider plugin in `server/utils/auth.ts`; check the better-auth docs for the current plugin name and setup.
- Final route: `POST /api/mcp`, resolves `userId` from the access token. Invalid/missing token → `401` with the `WWW-Authenticate` header the MCP spec requires.
- Remove the spike route and `NUXT_MCP_SPIKE_SECRET`.

## 9.2 Real `ask_cima` Tool

- Calls `runChatTurn({ userId, conversationId, content, mode: 'voice' })` (Task 06.5).
- Continuity: reuse the user's latest `source = 'gemini'` conversation if it had a message in the last 5 minutes, else create one.
- Tool description tells Gemini to pass the user's words **unchanged** and to read the reply **verbatim**.
- Optional `language` argument; when set, the reply uses it.
- Return the reply as plain text, max ~2 sentences (voice prompt, 6.6).

## 9.3 Safety

- Gemini already asks for confirmation on write tools. Expose `ask_cima` as **read-only** (MCP annotation `readOnlyHint: true`) so normal questions don't trigger a confirmation each time.
- Any change to child-app data still goes through Cima's own confirmation flow (Task 08), never directly.
- Data sent to Gemini is the reply text only. Document in the privacy notes that Google processes these replies.
- Rate limit: 30 calls a minute per user.

## 9.4 Tests & Verification

- MCP `initialize`, `tools/list`, `tools/call` with a mocked `runChatTurn`.
- `401` without/with an invalid token; user A's token can't reach user B's conversations.
- Repeat G1–G7 with the real tool.
- `yarn typecheck`, `yarn lint`, `yarn test:run`.
