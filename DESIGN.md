# Design Note: Bob & Alice Home Renovation Voice Assistant

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Browser (Next.js Client)                 │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │  Sidebar      │    │         Main Panel               │  │
│  │               │    │                                  │  │
│  │  Active Agent │    │  Transcript Log                  │  │
│  │  [Bob ●]      │    │  (user + agent messages)         │  │
│  │               │    │                                  │  │
│  │  Agent List   │    │  ┌────────────────────────────┐  │  │
│  │  Bob  ●       │    │  │  Push-to-Talk Button        │  │  │
│  │  Alice        │    │  │  (hold = record, release =  │  │  │
│  └──────────────┘    │  │   transcribe & send)         │  │  │
│                       │  └────────────────────────────┘  │  │
│                       └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
              │                    │                   │
              ▼                    ▼                   ▼
      POST /api/chat      POST /api/transcribe  POST /api/tts
              │                    │                   │
              ▼                    ▼                   ▼
    ┌─────────────────────────────────────────────────────┐
    │              Next.js API Routes (Server)             │
    │                                                      │
    │  /api/chat        → OpenAI gpt-4o-mini               │
    │  /api/transcribe  → OpenAI Whisper (whisper-1)       │
    │  /api/tts         → OpenAI TTS (tts-1)               │
    └─────────────────────────────────────────────────────┘
```

### Data Flow per Turn

```
1. User holds mic button  →  MediaRecorder captures audio
2. User releases          →  Audio blob sent to /api/transcribe
3. Whisper returns text   →  Displayed in transcript as "You"
4. Transfer check (regex) →  If transfer intent: skip LLM, go to step 7
5. Text + full history    →  Sent to /api/chat with active agent ID
6. LLM returns reply      →  Checked for [TRANSFER:alice/bob] token
7. Reply sent to /api/tts →  Audio played back to user
8. If transfer detected   →  New agent's intro played, agent switched
```

## Transfer Intent Detection

Two-layer approach:

### Layer 1 – Client-side regex (immediate, pre-LLM)
The user's transcribed text is matched against a set of regex patterns *before* calling the LLM:

```
"Transfer me to Alice" / "Go back to Bob" / "Let me talk to Alice" / etc.
```

If matched, the transfer happens immediately — no LLM round-trip needed. This keeps transfers fast and reliable.

### Layer 2 – LLM-initiated transfer (future scope)
The API strips `[TRANSFER:alice]` / `[TRANSFER:bob]` from LLM replies before TTS. Currently the **client only transfers on user intent** (Layer 1): if the user says "Transfer me to Alice" or "Go back to Bob," transfer runs; the client ignores transfer tokens from the LLM so the agent does not switch unless the user asks. A possible **future improvement** is to re-enable LLM-initiated transfer (agents suggest a handoff when appropriate, e.g. Bob says "I'll bring in Alice for that" and the app switches), optionally with a confirmation step to avoid surprise handoffs.

## State & Memory Across Transfer

The entire `messages[]` array (full conversation history) is maintained client-side and passed with every `/api/chat` request. When a transfer occurs:

1. The user's question is already in the messages array
2. The new agent receives the **complete conversation history** as context in its first LLM call
3. Each message has an optional `agentId` field so the history can show which agent said what
4. A synthetic handoff intro message is inserted into the history (e.g., "Hi, I'm Alice — I have full context...")

This means no explicit summarization step is needed for reasonable conversation lengths. The new agent "knows" everything immediately because the full chat history is its context window.

## Reflection

**Voice latency** is the first major challenge. Each turn does STT → LLM → TTS in sequence, so the user waits several seconds before hearing a reply. With more time, I’d stream the LLM output and start TTS as soon as the first sentence is ready, or move to a streaming/WebSocket pipeline so the user hears something sooner. The tradeoff is complexity and cost: streaming and chunked TTS need more moving parts and careful error handling.

**Transfer reliability** is another. Right now transfer is driven only by regex on the user’s words, which is predictable but brittle for phrasings we didn’t anticipate. I’d add a lightweight intent step (e.g. a small classifier or a fast LLM call) to handle “soft” requests like “this is getting technical,” and optionally a short confirmation (“Bringing Alice in for the structural stuff — OK?”) to avoid accidental handoffs. The tradeoff is extra latency and the need to tune when to confirm vs. when to transfer immediately.

**Conversational memory** works today by sending the full message history on every request, which is simple and preserves context across transfers. For long conversations we’d hit context limits and noise. With more time, I’d introduce a structured handoff summary (room, budget, key decisions) at transfer time and optionally a sliding window plus summary for very long chats, with the tradeoff that summarization can drop nuance and we’d need to test that handoffs still feel continuous.

**Interruptions and real-time dialogue** are limited today: push-to-talk only, no barge-in. We do allow stopping TTS and starting a new utterance (e.g. with Space), which helps. A full fix would be the OpenAI Realtime API or similar (full-duplex, VAD [voice activity detection], barge-in), trading off implementation and dependency complexity for a more natural, phone-like experience.

**UX and observability** are currently minimal: status text and agent colors. I’d add clearer “thinking”/“speaking” states, optional STT confidence, and tracing (e.g. OpenTelemetry) for STT/LLM/TTS latency so we can see where time is spent and fix regressions. The tradeoff is more UI and infra work for diminishing returns once the core flow is solid.

## Tradeoffs & What I'd Do With More Time

### Latency
- **Current**: Each turn has 3 sequential API calls (STT → LLM → TTS), adding up to ~3-5 seconds
- **Improvement**: Stream the LLM response and start TTS synthesis as soon as the first sentence is complete (streaming STT→LLM→TTS pipeline). Use WebSockets or Server-Sent Events instead of fetch
- **Also**: Add voice activity detection (VAD) so recording stops automatically on silence

### Transfer Reliability
- **Current**: Transfer is user-only (regex on phrases like "Transfer me to Alice" / "Go back to Bob"). The API strips `[TRANSFER:…]` from LLM output but the client does not act on it.
- **Improvement**: Add a lightweight intent classifier (could be a fast LLM call) to catch "soft" transfer hints like "I think this is getting technical" — not just explicit requests.
- **Future scope**: Re-enable **LLM-initiated transfer** so agents can suggest a handoff (e.g. Bob says "I'll bring in Alice for that" and the app switches to Alice), with an optional confirmation step ("Bringing Alice in for the structural questions — is that OK?") to avoid accidental transfers.

### Memory at Scale
- **Current**: Full message history in the context window — works well for ~20-30 turns, but degrades as the context grows
- **Improvement**: Generate a structured handoff summary at transfer time (room, goals, budget, concerns discovered so far) and prepend it as a compact system note rather than relying solely on the raw history
- **Also**: Persist state to a server-side session store so the conversation can be resumed after a page refresh

### UX & Observability
- **Current**: Basic transcript with agent color coding, status bar, active agent indicator
- **Improvement**: Add confidence scores for STT, show "Bob is thinking…" animations, display which part of history was used, agent-specific tone indicators
- **Also**: Add OpenTelemetry tracing to track latency per component (STT, LLM, TTS) for debugging production slowdowns

### Real-time Dialogue
- **Current**: Push-to-talk (half-duplex), no barge-in
- **Improvement**: Use the OpenAI Realtime API (WebRTC) for full-duplex, barge-in capable voice — eliminates the STT/TTS latency entirely and enables natural interruption handling

---

## Future scope (beyond requirements)

The implementation satisfies all stated requirements: voice conversation (push-to-talk), two agents (Bob & Alice) with distinct prompts, explicit transfer with context continuity and clear handoff, and minimal UI (active agent name + transcript log). The items below are either optional conveniences already in the app or enhancements for later.

**Optional conveniences (already in the app):**
- **Spacebar** for push-to-talk in addition to the mic button (requirement only asks for push-to-talk; method is flexible).
- **Interrupt TTS** by pressing Space to stop playback and start a new utterance (barge-in–style); keeps existing transcript. Not required; improves flow.
- **E2E test mode** (`?e2e=1`) and **Playwright tests** for repeatable verification; not in the spec.
- **Transcript formatting** (lists, bold) for readability; requirement is to “log” the transcript.
- **Refined UI** (layout, typography, colors) beyond strictly minimal; requirement is “minimal UI.”

**Future scope (with more time):**
- **Streaming STT/LLM/TTS** and VAD (voice activity detection) to reduce latency and avoid manual release-to-send.
- **Intent classifier** for “soft” transfer hints and optional **confirmation** before handoff.
- **LLM-initiated transfer** (agent suggests handoff; client acts on `[TRANSFER:…]`) with optional confirmation.
- **Structured handoff summary** and **persistence** (e.g. session store) for long or resumed conversations.
- **Observability**: tracing (e.g. OpenTelemetry) for STT/LLM/TTS latency.
- **Realtime API** (full-duplex, VAD [voice activity detection], native barge-in) for a more natural voice experience.
