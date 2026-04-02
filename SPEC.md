# Socrates Rubber Deck: System Specification

## 1. Project Overview
**Socrates Rubber Deck** is a standalone, local-first thinking environment. It acts as a bilingual (English/Chinese) cognitive mirror for solving complex, non-deterministic problems (e.g., 2-year economic forecasting).

### Three-Stage Behavioral Logic:
1. **Rubber Duck (Passive Flow):** When the user is speaking fluently, the AI remains in a "listening state," providing minimal, non-intrusive backchanneling (e.g., "Mmm", "继续", "I see") to maintain the user's flow.
2. **Socrates (Active Challenge):** When the AI detects a logical contradiction or a shallow assumption, it interrupts with a high-level question intended to "straighten the user's mindset" rather than provide an answer.
3. **Stuck Protocol (Manual Grounding):** Triggered by a physical UI button. The AI immediately synthesizes the session, provides a reality check, and performs a real-time web search for facts.

---

## 2. Technical Stack (2026 Optimized)
- **Primary Model:** Claude 4.6 Opus (Selected for superior native CJK reasoning and "sticky latch" caching).
- **Framework:** Next.js 16 (Unified Frontend/Backend architecture).
- **STT (Speech-to-Text):** Browser Web Speech API (Local, Free, Multi-language support).
- **TTS (Text-to-Speech):** Browser SpeechSynthesis API (Local, zero-cost) with a UI toggle.
- **Search Engine:** Tavily API (For real-time fact retrieval).
- **Prompt Caching:** Full utilization of Anthropic's 2026 prompt-caching headers to maintain long sessions at 1/10th the cost.

---

## 3. Core Implementation Details

### A. One-Command Startup
The system must be runnable via:
`npm run dev`
Accessible at: `http://localhost:3000`

### B. Storage & Privacy
- **Local Logging:** Every session is transcribed and appended locally to `./sessions/thinking_log_[TIMESTAMP].md`.
- **Zero-Cloud Leak:** No conversation data or credentials should be sent to any third party other than the Anthropic and Tavily endpoints.

### C. Bilingual Logic
The system must detect the user's language (EN/CN) dynamically. Responses must match the user's spoken language natively (No "Google Translate" feel).

---

## 4. Agentic System Prompt
Role: You are the Socrates Rubber Deck.
Language: Native Bilingual (English/Mandarin).

Behavioral Rules:
1. NEVER BE AN ASSISTANT: Do not offer to draft, code, or execute. Your only goal is to facilitate human thinking.
2. DUCK MODE: If the user is speaking, stay silent or use 1-word verbal nods ("Go on" / "继续").
3. SOCRATIC MODE: If the user logic is flawed, ask a question that forces them to defend it.
4. NO FORECASTING: Never tell the user what the future of the economy is. Instead, ask: "What specific indicator makes you believe that trend is sustainable?"
5. STUCK SIGNAL: Upon receiving the [STUCK] signal:
   - Summarize the current logic chain into 3 points.
   - Use 'web_search' to fetch 2 current economic facts related to the topic.
   - Ask: "Based on these current data points, does your thesis still hold?"

---

## 5. Development Workflow for Claude Code

1. **Initialize Project:** Create a Next.js 16 app with Tailwind CSS and an `/api/chat` route for the Anthropic SDK.
2. **Setup Voice Layer:** Implement `window.webkitSpeechRecognition` for real-time STT. Set `continuous: true` and implement language detection logic.
3. **Setup Logic Layer:** Configure the API to handle the `[STUCK]` signal. When received, the LLM must prioritize tool calling (`web_search`) before responding.
4. **Caching Integration:** Ensure the `System Prompt` and the cumulative history are tagged with `cache_control: { type: "ephemeral" }` to minimize costs.
5. **Persistence:** Build a simple Node.js file-writer in the backend to sync the `conversation_log` to the local `/sessions` directory in real-time.
6. **UI Design:** - A minimalist "Mindset Indicator" showing current state (Duck, Socrates, Searching).
   - A massive "I'M STUCK" button for manual grounding.
   - A toggle for "AI Voice" (TTS).
   - A clean, scrolling transcript view of the brainstorming session.

---

## 6. Quick Verification
- Ensure Claude 4.6 Opus is used for the logic core.
- Verify STT/TTS work locally in the browser without extra APIs.
- Confirm session files are creating successfully in the `./sessions` folder.
