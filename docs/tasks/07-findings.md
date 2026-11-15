# Task 07 – Findings

## Step 1a: Baseline with Gemini (Google's own assistant)

Default digital assistant: **Gemini** (officially supported by Garmin). Fenix 8 voice button pressed.

| Test                              | Result                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| Watch button opens Gemini         | ✅                                                              |
| Watch mic is used                 | ✅                                                              |
| Answer plays on the watch speaker | ✅                                                              |
| Works with the phone locked       | ✅                                                              |
| German understood                 | ✅, but Gemini **answered in English**. Swiss German not tested |
| Delay                             | ⚠️ Varied a lot (not measured)                                  |
| Ending a turn                     | ⚠️ No way on the watch to "send"; Gemini **kept listening**     |

Devices: phone model / Android version / Garmin Connect version / watch firmware: _to fill in_.

### What this proves

- The watch's phone-assistant path works on this phone, including with the phone locked.
- It does **not** prove A1–A3 for a third-party assistant. Gemini is the supported case; Cima Voice would be a third-party app. **Still no go/no-go decision.**

### Lessons for Cima Voice (valid either way)

- **Reply language:** don't rely on detection; send the recognizer language with each turn (Task 06.7, 07.3).
- **Ending the utterance:** the watch has no "send" control, and waiting for silence may never end. Cima Voice must close the utterance itself (Task 07.3).
- **Delay:** measure each step separately (Step 2, Task 06.8).

## Step 1b: Third-party assistant – ❌ Fail (no-go)

Set ChatGPT, then Claude, as the default digital assistant and pressed the watch button: **neither opened or responded.** Switching back to Gemini worked instantly.

**Conclusion:** the watch's assistant path only works with Google's assistant (most likely Garmin Connect targets it directly rather than whatever app is the default). A custom "Cima Voice" assistant can't be reached from the watch button. Tasks 06 (for the watch) and 07 are stopped; see the fallback in [watch-voice-plan.md](../watch-voice-plan.md#fallback-if-the-spike-fails).

Not tested: Perplexity, Home Assistant. Unlikely to behave differently, since ChatGPT supports the assistant role properly.
