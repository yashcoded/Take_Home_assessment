"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { AgentId, Message, TranscriptEntry } from "@/lib/types";
import { agents, detectTransferIntent } from "@/lib/agents";

// Audio blobs smaller than this are likely silence or recording errors
const MIN_AUDIO_BLOB_SIZE = 1000; // bytes

const HANDOFF_INTROS: Record<AgentId, (from: AgentId) => string> = {
  alice: (from) =>
    `Hi, I'm Alice. I've been following your conversation with ${agents[from].name} and have full context on your project. Let me dig into the technical details for you.`,
  bob: (from) =>
    `Hey, I'm Bob. I've been keeping up with everything you discussed with ${agents[from].name}. Let me put together a clear action plan for you.`,
};

/** Renders **bold** as <strong>bold</strong>. */
function renderBold(content: string): ReactNode {
  const parts = content.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return content;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/** Renders message text with newlines, **bold**, and checklist/list formatting. */
function MessageContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const items: ReactNode[] = [];
  let i = 0;

  const isUnorderedLine = (line: string) => /^\s*[-*•]\s+/.test(line);
  const isOrderedLine = (line: string) => /^\s*\d+\.\s*/.test(line);
  const isListLine = (line: string) => isUnorderedLine(line) || isOrderedLine(line);
  /** Strip list marker so <ol> can show 1, 2, 3, 4 (not "1. 1. 1."). */
  const getListContent = (line: string) =>
    line
      .replace(/^\s*[-*•]\s+/, "")
      .replace(/^\s*\d+\.\s*/, "")
      .trim();

  while (i < lines.length) {
    const line = lines[i];
    if (isListLine(line)) {
      const listLines: string[] = [];
      while (i < lines.length && isListLine(lines[i])) {
        listLines.push(getListContent(lines[i]));
        i++;
      }
      const isOrdered = isOrderedLine(line);
      const ListTag = isOrdered ? "ol" : "ul";
      items.push(
        <ListTag
          key={items.length}
          className={`list-outside pl-5 space-y-1 my-2 ${
            isOrdered ? "list-decimal" : "list-disc"
          }`}
          style={isOrdered ? { listStyleType: "decimal" } : undefined}
        >
          {listLines.map((content, j) => (
            <li key={j} className="pl-1">
              {renderBold(content)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }
    const paragraphLines: string[] = [];
    while (i < lines.length && !isListLine(lines[i])) {
      paragraphLines.push(lines[i]);
      i++;
    }
    const paragraph = paragraphLines.join("\n").trim();
    if (paragraph) {
      items.push(
        <span key={items.length} className="block whitespace-pre-line">
          {renderBold(paragraph)}
        </span>
      );
    }
  }

  return (
    <div className="whitespace-pre-line break-words">
      {items.length > 0 ? items : renderBold(text)}
    </div>
  );
}

export default function Home() {
  const [activeAgent, setActiveAgent] = useState<AgentId>("bob");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Press and hold to speak");
  const [transferring, setTransferring] = useState(false);
  const [e2eText, setE2eText] = useState("");
  const [e2eMode] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("e2e") === "1"
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentTTSUrlRef = useRef<string | null>(null);
  const interruptTTSRef = useRef(false);

  // Track active agent in a ref so async callbacks always see latest value
  const activeAgentRef = useRef<AgentId>("bob");
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const addTranscriptEntry = useCallback(
    (speaker: "user" | AgentId, text: string) => {
      setTranscript((prev) => [
        ...prev,
        { id: crypto.randomUUID(), speaker, text, timestamp: Date.now() },
      ]);
    },
    []
  );

  const stopTTS = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    if (currentTTSUrlRef.current) {
      URL.revokeObjectURL(currentTTSUrlRef.current);
      currentTTSUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const playTTS = useCallback(
    async (text: string, agentId: AgentId): Promise<void> => {
      if (e2eMode) {
        return; // Skip real TTS in e2e so tests don't depend on Audio in headless
      }
      setIsSpeaking(true);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, agentId }),
        });
        if (!res.ok) throw new Error("TTS failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        currentTTSUrlRef.current = url;
        return new Promise((resolve) => {
          const audio = new Audio(url);
          currentAudioRef.current = audio;
          const cleanup = () => {
            if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
              currentTTSUrlRef.current = null;
              URL.revokeObjectURL(url);
            }
            setIsSpeaking(false);
            resolve();
          };
          audio.onended = cleanup;
          audio.onerror = cleanup;
          audio.play().catch(cleanup);
        });
      } catch (err) {
        console.error("TTS error:", err);
        setIsSpeaking(false);
      }
    },
    [e2eMode]
  );

  const doTransfer = useCallback(
    async (
      targetAgent: AgentId,
      currentAgent: AgentId,
      currentMessages: Message[]
    ): Promise<void> => {
      setTransferring(true);
      setStatus(`Transferring to ${agents[targetAgent].name}…`);

      const intro = HANDOFF_INTROS[targetAgent](currentAgent);

      const handoffMessage: Message = {
        role: "assistant",
        content: intro,
        agentId: targetAgent,
      };

      const updatedMessages = [...currentMessages, handoffMessage];
      setMessages(updatedMessages);
      messagesRef.current = updatedMessages;
      setActiveAgent(targetAgent);
      activeAgentRef.current = targetAgent;
      addTranscriptEntry(targetAgent, intro);

      setTransferring(false);
      setStatus("Speaking…");
      await playTTS(intro, targetAgent);
      setStatus("Press and hold to speak");
    },
    [addTranscriptEntry, playTTS]
  );

  const handleUserMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;

      setIsProcessing(true);
      addTranscriptEntry("user", userText);

      const currentAgent = activeAgentRef.current;
      const currentMessages = messagesRef.current;

      const userTransferIntent = detectTransferIntent(userText, currentAgent);
      const userMessage: Message = { role: "user", content: userText };
      const updatedMessages = [...currentMessages, userMessage];

      setMessages(updatedMessages);
      messagesRef.current = updatedMessages;

      if (userTransferIntent) {
        setIsProcessing(false);
        await doTransfer(userTransferIntent, currentAgent, updatedMessages);
        return;
      }

      try {
        setStatus("Thinking…");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages, activeAgent: currentAgent }),
        });

        if (!res.ok) throw new Error("Chat API failed");
        const data = await res.json();

        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          agentId: currentAgent,
        };

        const messagesAfterReply = [...updatedMessages, assistantMessage];
        setMessages(messagesAfterReply);
        messagesRef.current = messagesAfterReply;
        addTranscriptEntry(currentAgent, data.reply);

        setStatus("Speaking…");
        await playTTS(data.reply, currentAgent);
        setStatus("Press and hold to speak");
      } catch (err) {
        console.error("Error:", err);
        setStatus("Error occurred. Try again.");
        setTimeout(() => setStatus("Press and hold to speak"), 2000);
      } finally {
        setIsProcessing(false);
      }
    },
    [addTranscriptEntry, doTransfer, playTTS]
  );

  const startRecording = useCallback(async () => {
    const isInterrupting = interruptTTSRef.current;
    if (isInterrupting) interruptTTSRef.current = false;
    if (!isInterrupting && (isRecording || isSpeaking || isProcessing || transferring)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
          setIsProcessing(false);
          setStatus("Press and hold to speak");
          return;
        }

        setStatus("Transcribing…");
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");

        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (data.text) {
            await handleUserMessage(data.text);
          } else {
            setIsProcessing(false);
            setStatus("Couldn't understand. Try again.");
            setTimeout(() => setStatus("Press and hold to speak"), 2000);
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setIsProcessing(false);
          setStatus("Transcription failed. Try again.");
          setTimeout(() => setStatus("Press and hold to speak"), 2000);
        }
      };

      recorder.start();
      setIsRecording(true);
      setStatus("Recording… release to send");
    } catch (err) {
      console.error("Microphone error:", err);
      setStatus("Microphone access denied");
    }
  }, [isRecording, isSpeaking, isProcessing, transferring, handleUserMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      setStatus("Processing…");
    }
  }, []);

  const handleMicPress = useCallback(() => {
    if (isSpeaking) {
      interruptTTSRef.current = true;
      stopTTS();
    }
    startRecording();
  }, [isSpeaking, startRecording, stopTTS]);

  // Spacebar: press and hold to speak from anywhere on the page (except when typing in an input).
  // If TTS is playing, Space stops it and starts recording (barge-in); existing transcript is kept.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      if (isSpeaking) {
        interruptTTSRef.current = true;
        stopTTS();
        startRecording();
        return;
      }
      if (isRecording || isProcessing || transferring) return;
      startRecording();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " && e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      stopRecording();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isRecording, isSpeaking, isProcessing, transferring, startRecording, stopRecording, stopTTS]);

  const agent = agents[activeAgent];
  const isBlue = agent.color === "blue";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-white">🏠 Home Renovation Assistant</h1>
        <p className="text-slate-300/80 text-sm">Voice-powered planning with Bob &amp; Alice</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-white/10 bg-slate-900/60 p-5 flex flex-col gap-5 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Active Agent</p>
            <div
              data-testid="active-agent-card"
              className={`rounded-2xl p-4 border transition-all duration-300 shadow-sm ${
                isBlue ? "bg-blue-950/70 border-blue-500/70" : "bg-purple-950/70 border-purple-500/70"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    isBlue ? "bg-blue-400" : "bg-purple-400"
                  }`}
                />
                <span
                  data-testid="active-agent-name"
                  className={`font-semibold text-base ${
                    isBlue ? "text-blue-300" : "text-purple-300"
                  }`}
                >
                  {agent.name}
                </span>
              </div>
              <p className="text-xs text-slate-300/80 mt-1">{agent.description}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Agents</p>
            {(["bob", "alice"] as AgentId[]).map((id) => (
              <div
                key={id}
                className={`flex items-center gap-2 p-2.5 rounded-xl mb-1 text-sm transition-colors ${
                  activeAgent === id
                    ? id === "bob"
                      ? "bg-blue-900/40 text-blue-200 border border-blue-700/40"
                      : "bg-purple-900/40 text-purple-200 border border-purple-700/40"
                    : "text-slate-400 border border-transparent"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    activeAgent === id
                      ? id === "bob"
                        ? "bg-blue-400"
                        : "bg-purple-400"
                      : "bg-gray-600"
                  }`}
                />
                <span>{agents[id].name}</span>
                {activeAgent === id && (
                  <span className="ml-auto text-xs opacity-50">active</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <p className="text-xs text-slate-400/80 leading-relaxed">
              Say &ldquo;Transfer me to Alice&rdquo; or &ldquo;Go back to Bob&rdquo; to switch agents.
            </p>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div data-testid="transcript-area" className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/30">
            {transcript.length === 0 && (
              <div className="text-center text-slate-400 mt-20">
                <p className="text-5xl mb-4">🎙️</p>
                <p className="text-lg font-medium text-slate-200">
                  Ready to chat with {agents[activeAgent].name}
                </p>
                <p className="text-sm mt-2 text-slate-400 max-w-sm mx-auto">
                  Press and hold the mic button or Spacebar to speak.
                </p>
              </div>
            )}
            {transcript.map((entry) => (
              <div
                key={entry.id}
                data-testid={`transcript-entry-${entry.speaker}`}
                className={`flex gap-3 ${
                  entry.speaker === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {entry.speaker !== "user" && (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1 ${
                      entry.speaker === "bob"
                        ? "bg-blue-600 text-white"
                        : "bg-purple-600 text-white"
                    }`}
                  >
                    {entry.speaker === "bob" ? "B" : "A"}
                  </div>
                )}
                <div
                  className={`max-w-md rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    entry.speaker === "user"
                      ? "bg-gray-700 text-white rounded-br-sm"
                      : entry.speaker === "bob"
                      ? "bg-blue-900/70 text-blue-50 rounded-bl-sm"
                      : "bg-purple-900/70 text-purple-50 rounded-bl-sm"
                  }`}
                >
                  {entry.speaker !== "user" && (
                    <p
                      className={`text-xs font-semibold mb-1 ${
                        entry.speaker === "bob" ? "text-blue-300" : "text-purple-300"
                      }`}
                    >
                      {agents[entry.speaker as AgentId].name}
                    </p>
                  )}
                  <MessageContent text={entry.text} />
                </div>
                {entry.speaker === "user" && (
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">
                    You
                  </div>
                )}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          <div className="border-t border-white/10 bg-slate-900/60 backdrop-blur p-6">
            {transferring && (
              <div className="text-center mb-3 text-amber-300 text-sm animate-pulse">
                🔄 Transferring…
              </div>
            )}
            <div className="flex flex-col items-center gap-3">
              <button
                data-testid="mic-button"
                type="button"
                onMouseDown={handleMicPress}
                onMouseUp={stopRecording}
                onKeyDown={(e) => {
                  if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    if (!e.repeat) handleMicPress();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.code === "Space") {
                    e.preventDefault();
                    stopRecording();
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleMicPress();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  stopRecording();
                }}
                disabled={isProcessing || transferring}
                aria-label="Press and hold to speak (mouse or Spacebar). Press during playback to interrupt and speak."
                className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all duration-150 select-none shadow-lg
                  ${
                    isRecording
                      ? "bg-red-600 scale-110 shadow-red-900"
                      : isProcessing || transferring
                      ? "bg-gray-700 cursor-not-allowed opacity-50"
                      : isBlue
                      ? "bg-blue-600 hover:bg-blue-500 cursor-pointer"
                      : "bg-purple-600 hover:bg-purple-500 cursor-pointer"
                  }`}
              >
                {isRecording ? "🔴" : isSpeaking ? "🔊" : "🎙️"}
              </button>
              <p data-testid="status" className="text-sm text-gray-400">{status}</p>
              {e2eMode && (
                <div className="flex gap-2 mt-2" data-testid="e2e-send-area">
                  <input
                    data-testid="e2e-text-input"
                    type="text"
                    value={e2eText}
                    onChange={(e) => setE2eText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (e2eText.trim()) {
                          handleUserMessage(e2eText.trim());
                          setE2eText("");
                        }
                      }
                    }}
                    placeholder="Type message (e2e)"
                    className="flex-1 px-3 py-2 rounded bg-gray-800 text-white text-sm"
                    disabled={isSpeaking || isProcessing || transferring}
                  />
                  <button
                    data-testid="e2e-send-button"
                    type="button"
                    onClick={() => {
                      if (e2eText.trim()) {
                        handleUserMessage(e2eText.trim());
                        setE2eText("");
                      }
                    }}
                    disabled={!e2eText.trim() || isSpeaking || isProcessing || transferring}
                    className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
