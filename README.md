# Bob & Alice – Home Renovation Voice Assistant

A voice-based AI assistant for planning home renovations, featuring two distinct agents (Bob and Alice) with seamless context-preserving transfers between them.

## Features

- 🎙️ **Push-to-talk voice input** using the browser microphone (Web Audio API)
- 🔊 **Text-to-speech responses** with distinct voices per agent (Bob = Echo, Alice = Nova)
- 🤝 **Seamless agent transfer** — full conversation context is passed to the new agent
- 📝 **Live transcript log** showing speaker labels and full conversation history
- 🏷️ **Active agent indicator** in the sidebar with visual distinction (blue = Bob, purple = Alice)

## Setup

### Prerequisites

- Node.js 18+
- An OpenAI API key with access to `gpt-4o-mini`, `whisper-1`, and `tts-1`

### Install

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=sk-...your-key-here...
```

### Run (Development)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run (Production)

```bash
npm run build
npm start
```

## How to Use

1. Open the app — Bob is active by default
2. **Press and hold** the microphone button to record
3. **Release** to send your message
4. Wait for the agent to respond via speech and text
5. Continue the conversation naturally

## Demo Phrases

### Test 1 — Intake and planning (Bob)
> "Hi Bob, I want to remodel my kitchen. Budget is around $25k. I want new cabinets and countertops, and maybe open up a wall."

Bob will ask clarifying questions and suggest a basic plan.

### Test 2 — Transfer to specialist (Alice)
> "Transfer me to Alice."

Alice confirms takeover with full context and addresses technical aspects (structural, permits, sequencing).

### Test 3 — Transfer back to Bob
> "Go back to Bob."

Bob resumes with context and produces a homeowner-friendly next-steps list.

### Other transfer phrases that work
- "Let me talk to Alice"
- "Get Alice"
- "Switch me to Bob"
- "Speak with Bob please"

## Architecture

See [DESIGN.md](./DESIGN.md) for the full design note, architecture diagram, and tradeoffs.

---

> **Disclaimer:** This assistant provides general home renovation information only. Always consult licensed professionals (contractors, structural engineers, electricians, plumbers) for structural, electrical, or plumbing decisions.
