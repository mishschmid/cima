# Cima on the Wrist – Garmin Fenix 8 Voice Plan

**Goal:** Press the voice button on the Fenix 8, talk to Cima, and hear the answer on the watch speaker, with no need to take out the phone. Through Cima's tools, the same turn can read and write data in the child apps (Sansa/health-core, Done., Ciaro).

See [architecture.md](./architecture.md). This plan brings forward part of step 3 (voice) and the "native app later" decision, so it must stay small and **start with a go/no-go test**.

## How it would work

```
Fenix 8 voice button
  → Garmin Connect (phone) opens the phone's default assistant
  → "Cima Voice" Android app (registered as default digital assistant)
  → on-phone speech to text
  → POST /api/voice/turn (device token)
  → Cima: memory + LLM + child-app tools
  → short reply → on-phone TTS → watch speaker
```

Biometric data (sleep, HRV, activities) does **not** go through this path. It already reaches health-core through the Garmin sync and is read by Cima through the health API.

## Known facts

- Garmin Connect IQ (watch apps) can't use the microphone, so a voice app on the watch is not possible.
- The Fenix 8 can open the **phone's default assistant app** through Garmin Connect (users switch between Bixby and Google this way).
- Android lets any app be the default digital assistant (`VoiceInteractionService`); iOS does not.
- The watch has no mobile data, so the phone must be in Bluetooth range.

## Unproven assumptions (the risks)

| #   | Assumption                                                                       | Why it's uncertain                                                                                                                             |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The watch button opens a **third-party** assistant, not only Google/Gemini/Bixby | Garmin only documents Google and Bixby; users report trouble even with Gemini                                                                  |
| A2  | Our app receives the **watch mic** and can play audio on the **watch speaker**   | Garmin asks for mic permission for Garmin Connect, so audio may be relayed by Garmin Connect rather than exposed as a normal Bluetooth headset |
| A3  | It works with the **phone locked** / screen off                                  | Android limits background mic access; users report failures when locked                                                                        |
| A4  | Speech recognition is good enough through the watch mic, incl. Swiss German      | Lower audio quality; Swiss German STT is an open question                                                                                      |
| A5  | Latency from button press to first spoken word is acceptable (< 4 s)             | Bluetooth audio setup + STT + LLM + TTS add up                                                                                                 |

A1–A3 are blockers. If any of them fails, stop the native path and use the fallback below.

## Phases

| Phase | Task                                                                                                                | Gate                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0     | [07.0 Feasibility spike](./tasks/07-android-voice-assistant.md#70-feasibility-spike-do-this-first) on real hardware | A1–A3 pass → continue. Otherwise → fallback.                 |
| 1     | [06 Watch voice endpoint & device tokens](./tasks/06-watch-voice-endpoint.md)                                       | Starts only after phase 0 passes                             |
| 2     | [07 Cima Voice Android app](./tasks/07-android-voice-assistant.md) (7.1–7.7)                                        | End-to-end turn on the watch, latency measured               |
| 3     | Child-app tools in Cima (architecture plan steps 2 and 6)                                                           | Without these, the watch reaches only Cima's chat and memory |
| 4     | [08 Confirmations for risky voice actions](./tasks/08-voice-action-confirmations.md)                                | Must land **before** any write tool is usable by voice       |

Phase 1 doesn't depend on the watch and could be useful for other clients later, but building it before phase 0 risks spending effort on a path that doesn't work.

## Fallback if the spike fails

- **Push-to-talk on the phone:** a home-screen widget or quick-settings tile in the same Android app (no watch involved). Most of phases 1–2 still apply.
- **Connect IQ quick actions (no voice):** a small watch app with a few fixed buttons (e.g. "How's my recovery?", "Log I'm done"). The watch talks to Cima through the phone and shows the short text reply.
- Revisit when Garmin opens up the assistant or mic APIs, or on a watch with an open assistant platform.

## Out of scope

- iOS (Siri can't be replaced; Shortcuts could be explored separately).
- A wake word ("Hey Cima") on the watch.
- Sending raw audio to the server (only recognised text leaves the phone).
- Play Store release; the app is installed from an APK for personal use first.

## Open questions

- Auth for the native app: device tokens (Task 06) for now; move to the shared auth service (OIDC) once it exists?
- Which STT for Swiss German if on-device recognition isn't good enough (and is sending audio to the server then acceptable under nDSG)?
- Should the voice turn have its own, faster model by default (Task 06.8)?
