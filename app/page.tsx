"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SetupScreen from "./components/SetupScreen";
import SessionSidebar from "./components/SessionSidebar";

type Mode = "duck" | "socrates" | "searching" | "idle";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface SessionListItem {
  id: string;
  startedAt: string;
  preview: string;
  messageCount: number;
}

// Generated client-side to avoid hydration mismatch
const generateSessionId = () => `${Date.now()}`;

const modeConfig: Record<Mode, { label: string; color: string; desc: string }> = {
  idle: { label: "IDLE", color: "bg-gray-600", desc: "Press mic to begin" },
  duck: { label: "DUCK", color: "bg-emerald-600", desc: "Listening..." },
  socrates: { label: "SOCRATES", color: "bg-amber-500", desc: "Challenging..." },
  searching: { label: "SEARCHING", color: "bg-blue-600", desc: "Grounding..." },
};

export default function Home() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [interimText, setInterimText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionId, setSessionId] = useState(generateSessionId);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingTranscriptRef = useRef("");
  const interimTextRef = useRef("");
  const isListeningRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const isSendingRef = useRef(false); // Guard against double API calls

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured);
        if (d.configured) {
          _fetchSessionsAndLoadLatest();
        }
      })
      .catch(() => setConfigured(false));
  }, []);

  const _fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
      return data.sessions || [];
    } catch {
      return [];
    }
  };

  const _fetchSessionsAndLoadLatest = async () => {
    const sessionList = await _fetchSessions();
    if (sessionList.length > 0) {
      _loadSession(sessionList[0].id);
    }
  };

  const _loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(id);
      setMessages(
        data.messages.map((m: { role: string; content: string; timestamp: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp,
        }))
      );
    } catch {
      // ignore load errors
    }
  };

  const handleNewSession = () => {
    // Stop any ongoing listening/TTS
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    setMode("idle");
    setInterimText("");
    setStreamingText("");
    setIsThinking(false);
    pendingTranscriptRef.current = "";
    interimTextRef.current = "";
    isSendingRef.current = false;
    isListeningRef.current = false;

    setSessionId(generateSessionId());
    setMessages([]);
  };

  const handleSelectSession = (id: string) => {
    // Stop any ongoing listening/TTS
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    setMode("idle");
    setInterimText("");
    setStreamingText("");
    setIsThinking(false);
    pendingTranscriptRef.current = "";
    interimTextRef.current = "";
    isSendingRef.current = false;
    isListeningRef.current = false;

    _loadSession(id);
    setSidebarOpen(false);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Refresh sessions list when messages change (updates preview)
    if (messages.length > 0) {
      _fetchSessions();
    }
  }, [messages, streamingText]);

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled || typeof window === "undefined") return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      if (/[\u4e00-\u9fff]/.test(text)) {
        utt.lang = "zh-CN";
      } else {
        utt.lang = "en-US";
      }
      utt.rate = 0.95;
      utt.pitch = 1;
      setIsSpeaking(true);
      utt.onend = () => setIsSpeaking(false);
      utt.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utt);
    },
    [voiceEnabled]
  );

  const detectMode = (text: string): Mode => {
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount <= 4) return "duck";
    return "socrates";
  };

  // Extract only the question from model output, stripping any reasoning/preamble
  const extractQuestion = (text: string): string => {
    // Strip <think> blocks first
    let clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (clean.split(/\s+/).length <= 5) return clean;
    const questions = clean.match(/[^.!?\n]*\?/g);
    if (questions && questions.length > 0) {
      return questions[questions.length - 1].trim();
    }
    const sentences = clean.split(/[.!]\s+/);
    return sentences[sentences.length - 1].trim();
  };

  const sendToAPI = useCallback(
    async (transcript: string, isStuck = false, currentMessages: Message[] = []) => {
      if (!transcript.trim() && !isStuck) return;
      if (isSendingRef.current) return; // Guard against double calls
      isSendingRef.current = true;

      const userMsg: Message = {
        role: "user",
        content: isStuck ? "[STUCK] " + transcript : transcript,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...currentMessages, userMsg];
      setMessages(updatedMessages);
      setIsThinking(true);
      if (isStuck) setMode("searching");
      setStreamingText("");

      const historyForAPI = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyForAPI,
            sessionId: sessionId,
            isStuck,
            language,
          }),
        });

        if (!res.ok || !res.body) throw new Error("API error");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  const visible = fullText.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/g, "").trim();
                  setStreamingText(visible);
                }
              } catch {}
            }
          }
        }

        const displayText = extractQuestion(fullText);
        const assistantMsg: Message = {
          role: "assistant",
          content: displayText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText("");
        setMode(detectMode(displayText));
        speak(displayText);
      } catch (err) {
        console.error(err);
        setMode("idle");
      } finally {
        setIsThinking(false);
        isSendingRef.current = false;
      }
    },
    [speak, sessionId, language]
  );

  const startListening = useCallback(
    (currentMessages: Message[]) => {
      if (typeof window === "undefined") return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        alert("Speech recognition not supported in this browser. Try Chrome or Edge.");
        return;
      }

      // Clean up any existing recognition first
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }

      // Clear transcript refs for fresh start
      pendingTranscriptRef.current = "";
      interimTextRef.current = "";

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "zh" ? "zh-CN" : "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setMode("duck");
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }

        setInterimText(interim);
        interimTextRef.current = interim;

        if (final) {
          pendingTranscriptRef.current += " " + final;
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (e: any) => {
        console.error("STT error:", e.error);
        if (e.error !== "no-speech") {
          setIsListening(false);
          setMode("idle");
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [sendToAPI, language]
  );

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setMode("idle");
    setInterimText("");
    // Include any interim text that hasn't been finalized yet
    const pending = (pendingTranscriptRef.current + " " + interimTextRef.current).trim();
    pendingTranscriptRef.current = "";
    interimTextRef.current = "";
    if (pending) {
      sendToAPI(pending, false, messagesRef.current);
    }
  }, [sendToAPI]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(messagesRef.current);
    }
  };

  const handleStuck = () => {
    const msgs = messagesRef.current;
    const context = msgs
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    sendToAPI(context, true, msgs);
  };

  const currentMode = modeConfig[mode];

  if (configured === null) return null; // loading
  if (!configured) return <SetupScreen onComplete={() => setConfigured(true)} />;

  return (
    <div className="h-screen w-full bg-gray-950 text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger menu (mobile) */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-gray-400 hover:text-gray-200 p-1"
              aria-label="Open sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Socrates Rubber Duck
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Cognitive Mirror · 思维镜</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Language Toggle */}
            <button
              onClick={() => setLanguage((l) => (l === "en" ? "zh" : "en"))}
              className="text-sm px-3 py-1.5 rounded-full border border-blue-600 text-blue-400 transition-colors"
            >
              {language === "en" ? "EN" : "中文"}
            </button>

            {/* TTS Toggle */}
            <button
              onClick={() => {
                setVoiceEnabled((v) => !v);
                if (isSpeaking) window.speechSynthesis.cancel();
              }}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                voiceEnabled
                  ? "border-emerald-600 text-emerald-400"
                  : "border-gray-700 text-gray-500"
              }`}
            >
              {voiceEnabled ? "AI Voice ON" : "AI Voice OFF"}
            </button>

            {/* Mode indicator */}
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${currentMode.color} ${
                  mode !== "idle" ? "animate-pulse" : ""
                }`}
              />
              <span className="text-sm font-mono text-gray-300">{currentMode.label}</span>
            </div>
          </div>
        </header>

      {/* Transcript */}
      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-4xl mb-4">🦆</p>
            <p className="text-lg">Start talking. Think out loud.</p>
            <p className="text-sm mt-2">Press the mic when ready.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gray-800 text-gray-100"
                  : "bg-gray-900 border border-gray-700 text-gray-200"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="text-xs text-gray-500 block mb-1 font-mono">
                  SOCRATES
                </span>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-gray-900 border border-gray-700 text-gray-200">
              <span className="text-xs text-gray-500 block mb-1 font-mono">
                SOCRATES
              </span>
              <p className="whitespace-pre-wrap">{streamingText}</p>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isThinking && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Interim STT text */}
        {interimText && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-gray-800/50 border border-gray-700/50 text-gray-400 italic">
              {interimText}
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </main>

      {/* Controls */}
      <footer className="flex-shrink-0 border-t border-gray-800 px-6 py-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          {/* I'M STUCK button */}
          <button
            onClick={handleStuck}
            disabled={isThinking || messages.length === 0}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm px-6 py-4 rounded-xl transition-colors uppercase tracking-widest shadow-lg"
          >
            I&apos;M STUCK
          </button>

          {/* Mic button */}
          <button
            onClick={toggleListening}
            disabled={isThinking}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-xl transition-all ${
              isListening
                ? "bg-red-600 hover:bg-red-500 scale-105 ring-4 ring-red-400/30"
                : "bg-gray-700 hover:bg-gray-600"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isListening ? "⏹" : "🎙"}
          </button>

          {/* Session info */}
          <div className="text-right text-xs text-gray-600">
            <p>{messages.filter((m) => m.role === "user").length} exchanges</p>
            <p className="font-mono">#{sessionId.slice(-6)}</p>
          </div>
        </div>

        {/* Status bar */}
        <div className="max-w-3xl mx-auto mt-3 text-center">
          <p className="text-xs text-gray-600">
            {isListening
              ? currentMode.desc
              : "Click mic to start · Click I'M STUCK for a reality check"}
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
