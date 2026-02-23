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

### Layer 2 – LLM-initiated transfer (contextual)
Each agent's system prompt instructs it to append `[TRANSFER:alice]` or `[TRANSFER:bob]` to its response when it judges a handoff is appropriate (e.g., Bob detects the user needs technical help). The API route strips this token before sending the text to TTS.

This allows agents to proactively suggest transfers based on conversation context, not just explicit user commands.

## State & Memory Across Transfer

The entire `messages[]` array (full conversation history) is maintained client-side and passed with every `/api/chat` request. When a transfer occurs:

1. The user's question is already in the messages array
2. The new agent receives the **complete conversation history** as context in its first LLM call
3. Each message has an optional `agentId` field so the history can show which agent said what
4. A synthetic handoff intro message is inserted into the history (e.g., "Hi, I'm Alice — I have full context...")

This means no explicit summarization step is needed for reasonable conversation lengths. The new agent "knows" everything immediately because the full chat history is its context window.

## Tradeoffs & What I'd Do With More Time

### Latency
- **Current**: Each turn has 3 sequential API calls (STT → LLM → TTS), adding up to ~3-5 seconds
- **Improvement**: Stream the LLM response and start TTS synthesis as soon as the first sentence is complete (streaming STT→LLM→TTS pipeline). Use WebSockets or Server-Sent Events instead of fetch
- **Also**: Add voice activity detection (VAD) so recording stops automatically on silence

### Transfer Reliability
- **Current**: Regex patterns cover common phrasings; the LLM can also initiate transfers
- **Improvement**: Add a lightweight intent classifier (could be a fast LLM call) to catch "soft" transfer hints like "I think this is getting technical" — not just explicit requests
- **Also**: Add a confirmation step ("Bringing Alice in for the structural questions — is that OK?") to avoid accidental transfers

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
