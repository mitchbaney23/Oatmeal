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

### ✅ COMPLETED - Full Audio & AI Pipeline
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
│   ├── llm/ (Claude/OpenAI + Ollama + strict JSON schema ✅)
│   ├── templates/ (Handlebars renderer ✅)
│   ├── storage/ (Prisma schema + services ✅)
│   ├── integrations/ (HubSpot/Gmail stubs)
│   ├── ui/ (Radix + Tailwind components ✅)
│   ├── learning/ (SRS scheduler + card generation ✅)
│   └── telemetry/ (local file sink ✅)
```

**✅ FULLY WORKING FEATURES:**
- ✅ **Complete Desktop App**: Tauri app builds and runs successfully
- ✅ **Audio Pipeline**: Real-time audio capture with automatic device detection (mic/system audio)
- ✅ **Local AI Transcription**: Whisper.cpp with Metal GPU acceleration (base.en model loaded)
- ✅ **Multi-LLM Support**: Ollama integration with Llama 3 8B + preference learning system
- ✅ **macOS Permissions**: Complete permission handling with UI prompts and status indicators
- ✅ **Global Shortcuts**: ⌘⇧R (record), ⌘⇧N (quick note) working
- ✅ **Real-time UI**: Live transcription display with audio level visualization
- ✅ **Dark Mode Theme**: Complete Oatmeal brand styling with gradient header logo
- ✅ **Database**: SQLite with session storage, settings persistence
- ✅ **Build System**: All commands working (`npm run build`, `test`, `lint`, `typecheck`, `tauri:dev`)

**✅ AI FEATURES IMPLEMENTED:**
- ✅ **Interactive AI Training**: Generate 3 summary variants (detailed, concise, action-focused)
- ✅ **Preference Learning**: User feedback system to improve AI outputs over time
- ✅ **Adaptive Summaries**: AI learns from user choices to generate better summaries
- ✅ **Multiple AI Approaches**: Different temperature/personality settings for variety

**✅ TECHNICAL ACHIEVEMENTS:**
- ✅ **Automatic Audio Routing**: Detects headphones/external audio and switches to system capture
- ✅ **Permission Management**: Graceful macOS microphone permission requests with clear UI
- ✅ **Real-time Processing**: Voice activity detection with chunked transcription
- ✅ **Error Handling**: Robust error handling with user-friendly messages

---

## CURRENT STATUS: 🎯 **MVP COMPLETE - Ready for Enhanced Features**

### 🚀 **WORKING END-TO-END FLOW**
1. **Record Meeting**: Click "New Note" or use ⌘⇧R
2. **Real-time Transcription**: Speech automatically transcribed using local Whisper
3. **AI Summary Generation**: Generate 3 different summary styles using Llama 3 8B
4. **Learn from Feedback**: Rate summaries to improve future AI outputs
5. **Session Management**: View history, search past meetings

### 🎉 **NEXT ENHANCEMENT PHASES**

### Phase 1: Advanced AI Features (Current Focus)
- **MEDDPICC Extraction**: Automatically identify sales methodology components
- **Action Items Detection**: Extract and format next steps
- **Meeting Insights**: Detect questions asked, opportunities missed
- **Sales Coaching**: Generate personalized feedback and suggestions

### Phase 2: Template System Enhancement
- **Custom Templates**: YAML-based summary templates for different meeting types
- **Email Draft Generation**: Auto-generate follow-up emails from summaries
- **CRM Integration**: Format summaries for HubSpot/Salesforce import
- **Export Options**: PDF, Markdown, JSON export formats

### Phase 3: Advanced Audio Features
- **Speaker Diarization**: Identify who said what in meetings
- **Audio Quality Enhancement**: Noise reduction and normalization
- **Multiple Language Support**: Extend beyond English transcription
- **Cloud Backup**: Optional cloud transcription for accuracy boost

### Phase 4: Integration Ecosystem
- **HubSpot Integration**: Direct sync with CRM contacts and deals
- **Gmail Integration**: Auto-draft follow-up emails
- **Calendar Integration**: Automatic meeting detection and scheduling
- **Slack/Teams**: Share summaries with team channels

### Phase 5: Learning & Analytics
- **Performance Tracking**: Sales performance metrics over time  
- **Coaching Dashboard**: Identify patterns and improvement areas
- **Spaced Repetition**: Flashcards for sales techniques and objection handling
- **Team Analytics**: Aggregate insights for sales teams

---

## Development Commands

```bash
# ✅ ALL WORKING COMMANDS
npm install              # Install all dependencies
npm run build           # Build all packages + frontend
npm run test            # Run test suites (LLM package tests pass)
npm run lint            # Lint all TypeScript code
npm run typecheck       # Type check all packages
npm run tauri:dev       # 🚀 Start full desktop app (Tauri + React)
npm run tauri:build     # Build production desktop binary
npm run dl:models       # Download Whisper models (already done)
```

### 🎯 **Quick Start Guide**
```bash
# 1. Start the desktop app
npm run tauri:dev

# 2. The app will launch with:
# - ✅ Whisper model loaded (Metal GPU acceleration)
# - ✅ Global shortcuts registered (⌘⇧R, ⌘⇧N)
# - ✅ Audio pipeline ready
# - ✅ Permission handling working

# 3. Test the full flow:
# - Click "New Note" or press ⌘⇧R
# - Grant microphone permissions when prompted
# - Speak into microphone (real-time transcription)
# - Stop recording to see AI summary generation
```

---

## ✅ Dependencies Status - ALL INSTALLED
1. **✅ Rust toolchain**: Installed and working
2. **✅ Tauri CLI**: Working (builds and runs successfully)
3. **✅ Whisper models**: Base.en model downloaded and loaded with Metal GPU
4. **✅ Ollama + Llama 3 8B**: Local AI model running for summaries
5. **✅ Audio system**: CPAL + system audio capture working

---

## 🗂️ Key Files & Architecture

### **Core Application Files:**
- `apps/desktop/src-tauri/src/main.rs` - ✅ **Tauri backend with full audio + AI commands**
- `apps/desktop/src-tauri/src/permissions.rs` - ✅ **macOS permission handling**
- `apps/desktop/src-tauri/src/audio/runtime.rs` - ✅ **Real-time audio capture + device detection**
- `apps/desktop/src-tauri/src/transcribe.rs` - ✅ **Whisper.cpp transcription**
- `apps/desktop/src-tauri/src/database.rs` - ✅ **SQLite session management**
- `apps/desktop/src/App.tsx` - ✅ **Main React app with full state management**
- `apps/desktop/src/hooks/useAudio.ts` - ✅ **Audio hook with VAD + real-time processing**

### **AI & Processing:**
- `packages/llm/src/providers/ollama.ts` - ✅ **Ollama integration + preference learning**
- `packages/llm/src/prompts/summary.ts` - ✅ **JSON schema + validation**
- `packages/llm/src/chain.ts` - ✅ **LLM pipeline implementation**
- `packages/storage/prisma/schema.prisma` - ✅ **Database schema with preferences**

### **UI Components:**
- `apps/desktop/src/components/PostCallScreen.tsx` - ✅ **AI summary generation + rating UI**
- `apps/desktop/src/components/RecorderPanel.tsx` - ✅ **Recording interface + audio levels**
- `apps/desktop/src/components/LiveNotes.tsx` - ✅ **Real-time transcription display**
- `apps/desktop/src/components/SettingsPanel.tsx` - ✅ **App configuration**
- `apps/desktop/src/components/SessionsHistory.tsx` - ✅ **Session management**

### **Configuration:**
- `apps/desktop/src-tauri/tauri.conf.json` - ✅ **Tauri config + macOS permissions**
- `apps/desktop/src-tauri/entitlements.plist` - ✅ **macOS entitlements**
- `apps/desktop/src-tauri/Cargo.toml` - ✅ **Rust dependencies (audio, AI, UI)**
- `package.json` - ✅ **npm workspaces + all scripts working**

---

## 🚀 Project Status Summary

**OATMEAL IS FULLY FUNCTIONAL** - Complete meeting assistant with:
- **Real-time transcription** using local Whisper AI
- **Interactive AI summaries** with Llama 3 8B learning from user feedback  
- **Automatic audio detection** (microphone vs system audio for headphones)
- **macOS integration** with proper permissions and global shortcuts
- **Modern UI** with dark mode, live audio visualization, and intuitive controls

**Ready for advanced features**: MEDDPICC extraction, CRM integrations, advanced coaching features.

**Development Environment**: Fully set up and working - just run `npm run tauri:dev` to start!