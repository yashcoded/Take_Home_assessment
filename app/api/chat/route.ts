import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { agents, detectTransferIntent } from "@/lib/agents";
import { AgentId, ChatRequest, Message } from "@/lib/types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Keep voice responses concise — 300 tokens is ~200-250 spoken words (~90 seconds)
const MAX_RESPONSE_TOKENS = 300;
// Moderate temperature: natural but consistent conversational tone
const LLM_TEMPERATURE = 0.7;

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    const { messages, activeAgent } = body;

    if (!activeAgent || !agents[activeAgent]) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
    }

    const agent = agents[activeAgent];

    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: agent.systemPrompt },
      ...messages
        .filter((m: Message) => m.role !== "system")
        .map((m: Message) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: apiMessages,
      max_tokens: MAX_RESPONSE_TOKENS,
      temperature: LLM_TEMPERATURE,
    });

    const rawReply =
      completion.choices[0]?.message?.content ?? "I'm sorry, I didn't catch that.";

    const transfer: AgentId | null = detectTransferIntent(rawReply, activeAgent);

    const cleanReply = rawReply
      .replace(/\[TRANSFER:alice\]/gi, "")
      .replace(/\[TRANSFER:bob\]/gi, "")
      .trim();

    const response: { reply: string; transfer?: AgentId } = { reply: cleanReply };
    if (transfer) {
      response.transfer = transfer;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
