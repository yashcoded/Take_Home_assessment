"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

export default function Home() {
  const [activeAgent, setActiveAgent] = useState<AgentId>("bob");
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Press and hold to speak");
  const [transferring, setTransferring] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

  const playTTS = useCallback(
    async (text: string, agentId: AgentId): Promise<void> => {
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
        return new Promise((resolve) => {
          const audio = new Audio(url);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setIsSpeaking(false);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            setIsSpeaking(false);
            resolve();
          };
          audio.play().catch(() => {
            setIsSpeaking(false);
            resolve();
          });
        });
      } catch (err) {
        console.error("TTS error:", err);
        setIsSpeaking(false);
      }
    },
    []
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

        if (data.transfer && data.transfer !== currentAgent) {
          await doTransfer(data.transfer, currentAgent, messagesAfterReply);
        } else {
          setStatus("Press and hold to speak");
        }
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
    if (isRecording || isSpeaking || isProcessing || transferring) return;
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

  const agent = agents[activeAgent];
  const isBlue = agent.color === "blue";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">🏠 Home Renovation Assistant</h1>
        <p className="text-gray-400 text-sm">Voice-powered planning with Bob &amp; Alice</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 border-r border-gray-800 p-4 flex flex-col gap-4 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Active Agent</p>
            <div
              className={`rounded-xl p-3 border-2 transition-all duration-300 ${
                isBlue ? "bg-blue-950 border-blue-500" : "bg-purple-950 border-purple-500"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    isBlue ? "bg-blue-400" : "bg-purple-400"
                  }`}
                />
                <span
                  className={`font-bold text-base ${
                    isBlue ? "text-blue-300" : "text-purple-300"
                  }`}
                >
                  {agent.name}
                </span>
              </div>
              <p className="text-xs text-gray-400">{agent.description}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Agents</p>
            {(["bob", "alice"] as AgentId[]).map((id) => (
              <div
                key={id}
                className={`flex items-center gap-2 p-2 rounded-lg mb-1 text-sm transition-colors ${
                  activeAgent === id
                    ? id === "bob"
                      ? "bg-blue-900/50 text-blue-200"
                      : "bg-purple-900/50 text-purple-200"
                    : "text-gray-500"
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
            <p className="text-xs text-gray-600 leading-relaxed">
              Say &ldquo;Transfer me to Alice&rdquo; or &ldquo;Go back to Bob&rdquo; to switch agents.
            </p>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.length === 0 && (
              <div className="text-center text-gray-600 mt-16">
                <p className="text-5xl mb-4">🎙️</p>
                <p className="text-lg font-medium text-gray-400">Ready to chat with Bob</p>
                <p className="text-sm mt-2 text-gray-600 max-w-sm mx-auto">
                  Try: &ldquo;Hi Bob, I want to remodel my kitchen. Budget is around $25k.&rdquo;
                </p>
              </div>
            )}
            {transcript.map((entry) => (
              <div
                key={entry.id}
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
                  {entry.text}
                </div>
                {entry.speaker === "user" && (
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">
                    You
                  </div>
                )}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          <div className="border-t border-gray-800 p-6">
            {transferring && (
              <div className="text-center mb-3 text-yellow-400 text-sm animate-pulse">
                🔄 Transferring…
              </div>
            )}
            <div className="flex flex-col items-center gap-3">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startRecording();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  stopRecording();
                }}
                disabled={isSpeaking || isProcessing || transferring}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl transition-all duration-150 select-none shadow-lg
                  ${
                    isRecording
                      ? "bg-red-600 scale-110 shadow-red-900"
                      : isSpeaking || isProcessing || transferring
                      ? "bg-gray-700 cursor-not-allowed opacity-50"
                      : isBlue
                      ? "bg-blue-600 hover:bg-blue-500 cursor-pointer"
                      : "bg-purple-600 hover:bg-purple-500 cursor-pointer"
                  }`}
              >
                {isRecording ? "🔴" : isSpeaking ? "🔊" : "��️"}
              </button>
              <p className="text-sm text-gray-400">{status}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
