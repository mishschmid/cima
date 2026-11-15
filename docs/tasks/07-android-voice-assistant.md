# Task 07 – "Cima Voice" Android Assistant App

**Goal:** A small Android app that registers as the phone's **default digital assistant**. When the Fenix 8 voice-assistant button is pressed, Android opens Cima Voice instead of Gemini. It listens through the watch mic, sends the text to `POST /api/voice/turn` (Task 06), and speaks the reply on the watch speaker.

Depends on: Task 06 (for 7.1+). 7.0 comes before everything else.

The app lives in a separate repo (`cima-android`), not in this Nuxt repo. Kotlin, min SDK 30, no third-party dependencies beyond AndroidX + OkHttp (or `HttpURLConnection`). Installed from an APK, not the Play Store.

---

## 7.0 Feasibility Spike (do this first, ~1 day)

This is the go/no-go gate for the whole plan ([watch-voice-plan.md](../watch-voice-plan.md)). Do it **before Task 06**. No Cima backend is needed.

Build a throwaway Android app that registers as the default digital assistant (`VoiceInteractionService` + `ASSIST` / `VOICE_COMMAND` activity, as in 7.1). It only logs and shows on screen: how it was launched (intent/action, extras), the available audio input/output devices, and the level of the recorded audio. It plays a fixed test tone/phrase with `TextToSpeech`.

Set it via _Settings → Apps → Default apps → Digital assistant app_, then test with the Fenix 8:

1. **Launch (A1):** Does the watch button open the spike app, or only Google/Gemini/Bixby, or nothing?
2. **Mic (A2):** Is the watch listed as an input device, and does speaking into the watch produce audio in the app (vs. only the phone mic)? Does Garmin Connect hold the mic instead?
3. **Speaker (A2):** Is the test phrase heard on the watch speaker?
4. **Locked phone (A3):** Repeat 1–3 with the phone locked and the screen off.
5. **Speech quality (A4):** Run `SpeechRecognizer` on a few sentences in English, German and Swiss German through the watch mic.
6. **Latency (A5):** Time from button press to the app starting, and to the test phrase being heard.

Write the results to `docs/tasks/07-findings.md` (phone model, Android version, Garmin Connect version, watch firmware, pass/fail per item).

- 1–4 pass → continue with Task 06, then 7.1+.
- Any of 1–4 fails → stop. Use the fallback in [watch-voice-plan.md](../watch-voice-plan.md#fallback-if-the-spike-fails).

## 7.1 Assistant Registration

- `CimaVoiceInteractionService` (`VoiceInteractionService`) plus a `VoiceInteractionSessionService`, declared with `android.permission.BIND_VOICE_INTERACTION` and an `interaction_service` XML.
- Fallback: an `AssistActivity` that handles `android.intent.action.ASSIST` and `android.intent.action.VOICE_COMMAND`.
- Permissions: `RECORD_AUDIO`, `INTERNET`, `BLUETOOTH_CONNECT`.

## 7.2 Audio Routing to the Watch

- If a Bluetooth headset (the watch) is connected, route audio to it: `AudioManager.setCommunicationDevice(...)` (API 31+), or `startBluetoothSco()` on older versions.
- Request audio focus (`AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE`) for the whole turn, and release it afterwards.
- If no watch is connected, use the phone's mic and speaker.

## 7.3 Turn Loop

1. Short vibration or tone: "listening".
2. `SpeechRecognizer` (prefer `createOnDeviceSpeechRecognizer` when available), language from settings, partial results on, silence timeout around 1.5 s.
   - The utterance must always end without a touch on the phone (the watch has no "send" button, see `07-findings.md`): silence timeout, **plus** a hard cap of 15 s of speech, **plus** if the partial transcript hasn't changed for 2 s, treat it as finished.
   - If pressing the watch button again during a session can be detected (Step 2 of 7.0), use it as "send now".
   - Short tone when the utterance is closed, so the user knows Cima stopped listening.
3. `POST {serverUrl}/api/voice/turn` with `Authorization: Bearer <token>`, body `{ text, conversationId, language }`, timeout 8 s. `language` is the recognizer language, so the reply never falls back to English.
4. `TextToSpeech` speaks `reply`, using the same language.
5. If `expectsFollowUp` (and that setting is on), go back to step 1, keeping `conversationId`. Otherwise finish the session.
6. Stop after 3 turns in a row with no speech or 60 s of inactivity.

## 7.4 Errors (never silent)

Each error gets a short spoken line plus a double vibration:

| Case                 | Spoken                                     |
| -------------------- | ------------------------------------------ |
| No speech recognized | "I didn't catch that."                     |
| Network / timeout    | "Cima isn't reachable right now."          |
| `401`                | "This device isn't connected to Cima."     |
| `5xx`                | `statusMessage` or "Something went wrong." |

## 7.5 Settings Screen

- Server URL, device token (pasted from `/devices`, stored in `EncryptedSharedPreferences`), language, "Listen again after questions" toggle.
- A "Test" button that runs one turn with the text "ping" and shows the reply and how long it took.
- A link to the system's default-assistant settings, with a hint if Cima Voice isn't selected.

## 7.6 Privacy

- No audio leaves the phone; only the recognized text is sent.
- Don't log transcripts to logcat in release builds.

## 7.7 Verification

- Manual run on the Pixel/Android phone + Fenix 8:
  - The watch button opens Cima Voice, the question is heard through the watch mic, and the answer is spoken on the watch.
  - A follow-up question keeps context ("And tomorrow?").
  - Airplane mode → the spoken network error.
  - Revoked token → the spoken 401 message.
- Note the latency from button press to first spoken word (target < 4 s).
