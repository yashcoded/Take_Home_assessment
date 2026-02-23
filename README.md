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
- API key(s) for the services you use for STT, LLM, and TTS. This implementation uses **OpenAI** for all three (`gpt-4o-mini`, `whisper-1`, `tts-1`); the spec allows any third-party APIs.

### Install

```bash
pnpm install
```

### Env vars (API keys)

The exercise allows any third-party APIs for STT/TTS/LLM. **This implementation** uses OpenAI for all three, so you need one key to run it.

**Where to put it:** in a file named `.env.local` in the **project root** (same folder as `package.json`). That file is gitignored and never committed.

**How to add it:**

1. **Option A — from the example file**
   - Copy the example: `cp .env.example .env.local` (or on Windows: `copy .env.example .env.local`).
   - Open `.env.local` and set your key:
     ```env
     OPENAI_API_KEY=sk-your-actual-key-here
     ```

2. **Option B — create the file manually**
   - In the project root, create a new file named `.env.local`.
   - Add this line (replace with your key):
     ```env
     OPENAI_API_KEY=sk-your-actual-key-here
     ```

**Getting an OpenAI key:** [OpenAI API keys](https://platform.openai.com/api-keys). This build uses `gpt-4o-mini`, `whisper-1`, and `tts-1`.

**Note:** Tests use mocks and do not need any API key. Only `pnpm dev` / running the app locally requires it.

### Run (Development)

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run (Production)

```bash
pnpm build
pnpm start
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

## Testing

Install Playwright browsers once (required for e2e tests):

```bash
pnpm exec playwright install
```

Run all tests:

```bash
pnpm test
```

Tests include unit tests for agent transfer detection (`lib/agents`) and e2e tests for the voice assistant flows (initial load, send message to Bob, transfer to Alice, transfer back to Bob). E2e tests mock the chat and TTS APIs and use a test-only text input (visible when you open `/?e2e=1`) so they run without an OpenAI key or real mic.

## Contributors

- [@yashcoded](https://github.com/yashcoded)

## Architecture

See [DESIGN.md](./DESIGN.md) for the full design note, including the required **Reflection** (challenges and improvements with tradeoffs), architecture diagram, detailed tradeoffs, and **Future scope** (enhancements beyond the stated requirements).

---

> **Disclaimer:** This assistant provides general home renovation information only. Always consult licensed professionals (contractors, structural engineers, electricians, plumbers) for structural, electrical, or plumbing decisions.
