"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SetupScreen from "./components/SetupScreen";
import SessionSidebar from "./components/SessionSidebar";
import SettingsModal from "./components/SettingsModal";

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
  idle: { label: "IDLE", color: "bg-gray-600", desc: "Hold mic to speak" },
  duck: { label: "DUCK", color: "bg-emerald-600", desc: "Recording..." },
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
  const [isThinking, setIsThinking] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sessionId, setSessionId] = useState(generateSessionId);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const isSendingRef = useRef(false); // Guard against double API calls
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const MIN_RECORDING_MS = 500; // Minimum recording duration to avoid accidental taps

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
          _checkWhisperAvailability();
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

  const _checkWhisperAvailability = () => {
    fetch("/api/transcribe")
      .then((r) => r.json())
      .then((data) => setWhisperAvailable(data.available))
      .catch(() => setWhisperAvailable(false));
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
    // Stop any ongoing recording/TTS
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    setMode("idle");
    setStreamingText("");
    setIsThinking(false);
    setDraftText("");
    setIsTranscribing(false);
    isSendingRef.current = false;

    setSessionId(generateSessionId());
    setMessages([]);
  };

  const handleSelectSession = (id: string) => {
    // Stop any ongoing recording/TTS
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    setMode("idle");
    setStreamingText("");
    setIsThinking(false);
    setDraftText("");
    setIsTranscribing(false);
    isSendingRef.current = false;

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

  // Auto-detect language from text (Chinese if contains Chinese chars, else English)
  const _detectLanguage = (text: string): "en" | "zh" => {
    return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
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

      // Auto-detect language from the transcript
      const language = _detectLanguage(transcript);

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
    [speak, sessionId]
  );

  const _transcribeWithWhisper = async (audioBlob: Blob): Promise<string> => {
    // Match file extension to actual MIME type
    const ext = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("audio", audioBlob, `audio.${ext}`);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Transcription API error:", errData);
      throw new Error(errData.error || "Transcription failed");
    }
    const data = await res.json();
    return data.text || "";
  };

  const _startWhisperRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Find a supported MIME type
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      let mimeType = "";
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      recordStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(); // Start without timeslice for better compatibility
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
      setMode("duck");
    } catch (err) {
      console.error("Failed to start Whisper recording:", err);
      alert("Microphone access denied or not available.");
    }
  }, []);

  // Returns transcribed text (or empty string if too short / no audio)
  const _stopWhisperRecording = useCallback(async (): Promise<string> => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return "";

    const recordingDuration = Date.now() - recordStartTimeRef.current;
    const mimeType = mediaRecorder.mimeType || "audio/webm";

    return new Promise<string>((resolve) => {
      mediaRecorder.onstop = async () => {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;

        // Skip if recording too short or no audio data
        if (recordingDuration < MIN_RECORDING_MS || audioBlob.size < 1000) {
          setIsListening(false);
          setMode("idle");
          resolve("");
          return;
        }

        setIsTranscribing(true);
        try {
          const transcript = await _transcribeWithWhisper(audioBlob);
          resolve(transcript.trim());
        } catch (err) {
          console.error("Whisper transcription error:", err);
          resolve("");
        } finally {
          setIsTranscribing(false);
          setIsListening(false);
          setMode("idle");
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  // Hold-to-record handlers for Whisper mode
  const handleMicDown = useCallback(() => {
    if (isThinking || isTranscribing) return;
    if (whisperAvailable) {
      _startWhisperRecording();
    }
  }, [isThinking, isTranscribing, whisperAvailable, _startWhisperRecording]);

  const handleMicUp = useCallback(async () => {
    if (!mediaRecorderRef.current) return;
    const transcript = await _stopWhisperRecording();
    if (transcript) {
      setDraftText((prev) => (prev ? prev + " " + transcript : transcript));
    }
  }, [_stopWhisperRecording]);

  const handleSendDraft = useCallback(() => {
    const text = draftText.trim();
    if (!text || isThinking) return;
    setDraftText("");
    sendToAPI(text, false, messagesRef.current);
  }, [draftText, isThinking, sendToAPI]);

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
    <div className="h-dvh w-full bg-gray-950 text-gray-100 flex overflow-hidden">
      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={_checkWhisperAvailability}
      />

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
            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
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
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6 space-y-4 max-w-3xl mx-auto w-full" style={{ WebkitOverflowScrolling: "touch" }}>
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-4xl mb-4">🦆</p>
            <p className="text-lg">Start talking. Think out loud.</p>
            <p className="text-sm mt-2">Hold the mic to speak, or type below.</p>
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

        <div ref={scrollRef} />
      </main>

      {/* Controls */}
      <footer className="flex-shrink-0 border-t border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Text input row */}
          <div className="flex items-end gap-3">
            {/* I'M STUCK button */}
            <button
              onClick={handleStuck}
              disabled={isThinking || messages.length === 0}
              className="flex-shrink-0 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-2 rounded-lg transition-colors uppercase tracking-wider"
            >
              STUCK
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={isTranscribing ? "Transcribing..." : "Hold mic to speak, or type here..."}
                disabled={isTranscribing}
                rows={1}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-12 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none min-h-[48px] max-h-[120px]"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendDraft();
                  }
                }}
              />
              {isTranscribing && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-gray-500 border-t-emerald-400 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Mic button - hold to record */}
            <button
              onMouseDown={handleMicDown}
              onMouseUp={handleMicUp}
              onMouseLeave={handleMicUp}
              onTouchStart={handleMicDown}
              onTouchEnd={handleMicUp}
              disabled={isThinking || isTranscribing || !whisperAvailable}
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-all select-none ${
                isListening
                  ? "bg-red-600 scale-110 ring-4 ring-red-400/30"
                  : "bg-gray-700 hover:bg-gray-600"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={whisperAvailable ? "Hold to record" : "Configure OpenAI key in settings for voice input"}
            >
              {isListening ? "🔴" : "🎙"}
            </button>

            {/* Send button */}
            <button
              onClick={handleSendDraft}
              disabled={!draftText.trim() || isThinking || isTranscribing}
              className="flex-shrink-0 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-3 rounded-xl transition-colors"
            >
              Send
            </button>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <p>
              {isListening
                ? "Recording... release to transcribe"
                : isTranscribing
                ? "Transcribing..."
                : whisperAvailable
                ? "Hold mic to speak · Enter to send"
                : "Type your message · Enter to send"}
            </p>
            <p className="font-mono">#{sessionId.slice(-6)} · {messages.filter((m) => m.role === "user").length} exchanges</p>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
