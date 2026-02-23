import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Different voices for Bob and Alice to distinguish them audibly
const AGENT_VOICES: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  bob: "echo",
  alice: "nova",
};

// Normal conversational pace (1.0 = default, range 0.25–4.0)
const DEFAULT_SPEECH_SPEED = 1.0;

export async function POST(req: NextRequest) {
  try {
    const { text, agentId } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const voice = AGENT_VOICES[agentId] ?? "alloy";

    const openai = getOpenAI();
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      speed: DEFAULT_SPEECH_SPEED,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return NextResponse.json({ error: "Failed to synthesize speech" }, { status: 500 });
  }
}
