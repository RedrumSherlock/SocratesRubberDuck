# Socrates Rubber Duck

A bilingual (English/Mandarin) cognitive mirror for deep thinking sessions. Acts as a rubber duck when you're in flow, and a Socrates when your logic slips.

## Requirements

- **Node.js >= 20.9.0** (check with `node -v`; upgrade via [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org))
- **Bun** or npm/yarn/pnpm
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com)
- Tavily API key (for the I'M STUCK web search) — [app.tavily.com](https://app.tavily.com)

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure API keys
cp .env.local.example .env.local
# Edit .env.local and fill in ANTHROPIC_API_KEY and TAVILY_API_KEY

# 3. Start
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome or Edge** (required for Web Speech API).

## How it works

| Mode | Indicator | Behavior |
|------|-----------|----------|
| DUCK | Green | Listening — minimal backchanneling while you think out loud |
| SOCRATES | Amber | Detected a logical gap — asks you one sharp question |
| SEARCHING | Blue | I'M STUCK triggered — fetches live web facts, synthesizes your logic chain |

- **Mic button** — start/stop voice input (2.5s silence = end of utterance)
- **I'M STUCK** — reality check: summarizes your reasoning, pulls 2 current facts from the web, asks if your thesis holds
- **AI Voice toggle** — browser TTS, auto-switches EN/中文

Sessions are logged locally to `./sessions/thinking_log_[SESSION_ID].md`. Nothing is sent anywhere except the Anthropic and Tavily APIs.
