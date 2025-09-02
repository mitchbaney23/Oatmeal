# Oatmeal Project Overview

Oatmeal is a **Granola.ai-style meeting assistant** with a twist: it is designed as a **seller's personal coach**. 
Instead of just summarizing calls, Oatmeal extracts **sales-focused insights** (MEDDPICC, next steps, risks) and 
**personal learning opportunities** (good questions, missed opportunities, skill scores). 

It is **privacy-first** (local transcription by default, opt-in recording) and lightweight (menubar app).

---

## Core Principles
- **Privacy by default** → on-device Whisper transcription, local encrypted storage (sqlcipher).
- **Seller-first outputs** → MEDDPICC grid, next steps, CRM updates, learning debriefs.
- **Individual coaching** → tailored micro-lessons, skill scoring, and spaced repetition flashcards.
- **Templates everywhere** → customizable YAML/Handlebars templates for summaries, follow-up emails, CRM notes.
- **Integrations optional** → HubSpot notes, Gmail drafts, Slack posts, but always user-controlled.

---

## Current Implementation Status

### ✅ COMPLETED - Project Scaffold (Bootstrap)
**Structure Created:**
```
/ (repo root)
├── package.json (npm workspaces)
├── tsconfig.base.json, .eslintrc.js, .prettierrc, tailwind.config.js
├── .env.example with API keys
├── apps/desktop/ (Tauri + React app)
├── packages/
│   ├── audio-core/ (interfaces only)
│   ├── transcribe/ (EventEmitter stub)
│   ├── diarize/ (basic clustering interface)
│   ├── llm/ (Claude/OpenAI + strict JSON schema ✅)
│   ├── templates/ (Handlebars renderer ✅)
│   ├── storage/ (Prisma schema + services ✅)
│   ├── integrations/ (HubSpot/Gmail stubs)
│   ├── ui/ (Radix + Tailwind components ✅)
│   ├── learning/ (SRS scheduler + card generation ✅)
│   └── telemetry/ (local file sink ✅)
```

**Working Features:**
- ✅ **Build system**: `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck` all pass
- ✅ **UI Components**: MenuBar, RecorderPanel, LiveNotes, SettingsPanel, PostCallScreen
- ✅ **Global hotkeys**: ⌘⇧R (record), ⌘⇧N (quick note) - registered in Tauri backend
- ✅ **Settings UI**: Privacy toggles, retention days, model selection, integration status
- ✅ **Database schema**: Settings, UserProfile, Session, SrsCard, SrsReview tables
- ✅ **LLM integration**: Strict JSON schema validation for meeting summaries
- ✅ **Template system**: YAML + Handlebars with helpers (join, titleCase)

**Current Status**: Frontend builds and runs, Tauri backend has command stubs, but **no actual audio processing yet**.

---

## NEXT IMPLEMENTATION PHASES

### Phase 1: Audio Foundation 🎯 **CURRENT PRIORITY**
**Required**: Rust/Cargo installation

1. **Install Rust toolchain** (rustup, cargo)
2. **Audio Capture Implementation**:
   - Rust: CoreAudio binding (cpal or coreaudio-rs)
   - 16kHz mono PCM, 20ms frames (320 samples)
   - WebRTC VAD with threshold 0-3
   - Tauri commands: `audio_start`, `audio_stop`, `audio:frame` events
3. **TypeScript Audio Client**:
   - Ring buffer (2s backpressure)
   - Frame subscription with backpressure handling
   - Integration with React UI state

### Phase 2: Transcription Pipeline
1. **Whisper.cpp Integration**:
   - Rust binding to whisper.cpp
   - Model management (tiny/base/small/medium)
   - Streaming transcription with partials
   - Realtime factor (RTF) monitoring for cloud fallback
2. **Cloud Fallback**: Deepgram or AssemblyAI WebSocket
3. **Speaker Diarization**: Basic clustering with embeddings

### Phase 3: LLM Pipeline & Templates  
1. **Complete Claude/OpenAI clients** with retry logic
2. **Template engine** with sample YAML templates
3. **Summary pipeline**: transcript → JSON → markdown/email
4. **Learning extraction**: skill scoring, moment detection

### Phase 4: Integrations & Storage
1. **Database initialization** and settings persistence 
2. **HubSpot API**: Private app token, engagement notes
3. **Gmail API**: OAuth flow, draft creation
4. **File exports**: ZIP generation, session artifacts

### Phase 5: Polish & Testing
1. **End-to-end testing**: record → transcribe → summarize → export
2. **Error handling**: graceful failures, user feedback
3. **Performance optimization**: memory usage, model switching

---

## Development Commands

```bash
# Current working commands
npm install              # ✅ Works
npm run build           # ✅ Works (frontend only)
npm run test            # ✅ Works (LLM package tests pass)  
npm run lint            # ✅ Works
npm run typecheck       # ✅ Works

# Planned commands (need Rust)
npm run tauri:dev       # Start Tauri dev server
npm run tauri:build     # Build desktop app binary
npm run dl:models       # Download whisper models
npm run sample:record   # Record test audio
```

---

## Critical Dependencies Needed
1. **Rust toolchain**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. **Tauri CLI**: Will be available after Rust install
3. **Whisper models**: Download via `npm run dl:models` script (already created)
4. **API keys**: Add to `.env` file (template created)

---

## File Locations for Context

**Key Implementation Files:**
- `apps/desktop/src-tauri/src/main.rs` - Tauri backend with command stubs
- `apps/desktop/src/App.tsx` - Main React app with state management
- `packages/llm/src/prompts/summary.ts` - JSON schema + validation ✅
- `packages/llm/src/chain.ts` - LLM pipeline implementation ✅
- `packages/storage/prisma/schema.prisma` - Database schema ✅
- `packages/templates/src/index.ts` - YAML/Handlebars renderer ✅

**Configuration:**
- `package.json` - Root npm workspaces config
- `tsconfig.base.json` - Shared TypeScript config
- `apps/desktop/src-tauri/tauri.conf.json` - Tauri app configuration
- `.env.example` - Environment variables template

---

## Next Immediate Steps

The foundation is solid. To continue building:

1. **Install Rust** (prerequisite for all audio work)
2. **Implement audio capture** in `packages/audio-core` 
3. **Wire up real audio pipeline** to replace UI stubs
4. **Add Claude API integration** for actual summarization
5. **Test end-to-end flow**

The project structure supports incremental development - each package can be implemented and tested independently.