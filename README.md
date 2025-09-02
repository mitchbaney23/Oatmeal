# Oatmeal

Cross-platform desktop app for audio capture, transcription, and meeting analysis. Built with Tauri (Rust + React/TypeScript).

## Quick Start

```bash
# Install dependencies
npm install

# Download whisper models (optional, for local transcription)
npm run dl:models

# Start development
npm run dev

# Record a 30s sample for testing
npm run sample:record
```

## Project Structure

```
apps/
  desktop/           # Tauri desktop app
packages/
  audio-core/        # Audio capture (CoreAudio + WebRTC VAD)
  transcribe/        # Whisper.cpp + cloud fallback
  diarize/           # Speaker labeling
  llm/               # Claude/OpenAI providers + prompts
  templates/         # YAML + Handlebars renderer
  integrations/      # HubSpot, Gmail, etc.
  ui/                # Shared Tailwind + Radix components
  storage/           # SQLite + Prisma
  learning/          # SRS coaching system
  telemetry/         # Anonymous usage metrics
```

## Features

- **Menu Bar App**: Global hotkeys for start/stop recording (⌘⇧R) and quick notes (⌘⇧N)
- **Live Transcription**: On-device whisper.cpp with cloud fallback
- **Speaker Diarization**: Automatic speaker labeling
- **Meeting Analysis**: Extract MEDDPICC, pain points, next steps
- **Template System**: Generate summaries and follow-up emails
- **Integrations**: Push notes to HubSpot, create Gmail drafts
- **Privacy First**: Local-only by default, encrypted storage
- **Learning Coach**: Personal sales coaching with spaced repetition

## Setup

### Prerequisites

- Node.js 18+
- Rust (for Tauri backend)
- macOS 10.15+ (primary target)

### Installation

1. Clone and install:
   ```bash
   git clone <repo>
   cd oatmeal
   npm install
   ```

2. Copy environment file:
   ```bash
   cp .env.example .env
   ```

3. Add your API keys to `.env`:
   ```bash
   ANTHROPIC_API_KEY=your_claude_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Initialize database:
   ```bash
   cd packages/storage
   npx prisma generate
   npx prisma db push
   ```

### macOS Permissions

The app requires microphone access. On first run:

1. Go to System Preferences → Security & Privacy → Privacy
2. Click Microphone and check the box next to Oatmeal
3. Restart the app

### Development

```bash
# Start all packages in watch mode
npm run dev

# Run tests
npm run test

# Lint and typecheck
npm run lint
npm run typecheck

# Build for production
npm run build
```

## Configuration

Settings are stored locally in `~/Oatmeal/oatmeal.db`. Configure:

- **Privacy**: Telemetry, data retention (7-365 days)
- **Performance**: GPU acceleration, model selection
- **Integrations**: HubSpot, Gmail OAuth status

## Usage

1. **Start Recording**: Press ⌘⇧R or click the Record button
2. **Live Notes**: View real-time transcription with speaker labels
3. **Mark Moments**: Click "Mark Moment" to highlight important sections
4. **Stop & Analyze**: Press ⌘⇧R again to stop and generate summary
5. **Review**: Edit summary and follow-up email
6. **Export**: Push to CRM or create email draft

### Global Shortcuts

- `⌘⇧R`: Start/stop recording
- `⌘⇧N`: Create quick note

## Privacy & Security

- **Local First**: All processing happens on-device by default
- **Encrypted Storage**: SQLite database encrypted with sqlcipher
- **No Cloud Upload**: Transcripts never leave your machine unless explicitly enabled
- **Retention**: Auto-delete recordings after configured period
- **Audit Trail**: All integrations support dry-run mode

## Troubleshooting

### Audio Issues

- Check microphone permissions in System Preferences
- Verify default input device in Audio MIDI Setup
- Try restarting the app

### Performance

- Use GPU acceleration for faster transcription
- Switch to cloud providers if local processing is too slow
- Adjust whisper model size (tiny/base for speed, small/medium for quality)

### Integration Issues

- Verify API keys in `.env`
- Check OAuth consent for Google services
- Test with dry-run mode first

## Development

### Adding New Integrations

1. Create package under `packages/integrations/`
2. Implement OAuth flow and API client
3. Add feature flag to `.env.example`
4. Update settings UI

### Testing

Each package includes unit tests. Run specific tests:

```bash
cd packages/llm
npm test
```

## License

MIT