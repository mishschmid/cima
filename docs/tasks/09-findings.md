# Task 09 – Findings (Gemini MCP spike)

Spike endpoint: `https://cima.you/api/mcp/<secret>`, added in Gemini → Connectors → Custom, no auth.

| #   | Test                               | Result                                                      |
| --- | ---------------------------------- | ----------------------------------------------------------- |
| G1  | Gemini web, `@Cima ask Cima hello` | ✅ "Cima here. You said: hello. Time on the server: 20:29." |
| G2  | Gemini app, typed                  | ✅                                                          |
| G3  | Gemini app, by voice               | ❌ "Cima" recognised as "Jima"; tool not called             |
| G4  | Watch button, phone locked         | _to do_                                                     |
| G5  | Watch, German                      | _to do_                                                     |
| G6  | Reply read verbatim or rephrased?  | Web: verbatim                                               |
| G7  | Delay, 5 runs                      | _to do_                                                     |

## Notes

- Custom Connectors work on a personal account in Switzerland (help page says US only).
- **Name recognition:** "Cima" (pronounced "Chee-ma") is transcribed as "Jima". Fix attempt 1: the tool description and server instructions list common mishearings and add "ask my companion" as a fallback phrase. If that isn't reliable, the spoken trigger may need a name that speech recognition handles well (to decide with the product name in mind).
