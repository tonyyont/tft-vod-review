# TFT VOD Review Tool

A local-first VOD review tool for TFT players that pairs each OBS recording with match metadata and a single structured review field.

## Features

- 📁 **Local VOD Library**: Automatically scans and lists MP4 files from your OBS recording folder
- ✍️ **Simple Reviews**: One free-form text field per VOD for quick notes
- 🎮 **Match Metadata**: Link VODs to TFT matches and view placement, augments, traits, and final board
- 🎥 **Video Playback**: Watch videos directly in the app while writing reviews
- 💾 **Auto-save**: Reviews save automatically as you type
- 🔒 **Privacy-first**: All data stored locally, no cloud sync

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- OBS (or any tool that records MP4 files)
- (Optional) Riot API key for match metadata

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the Electron main process:
   ```bash
   npm run build:electron
   ```

4. Start the development server:
   ```bash
   npm run electron:dev
   ```

### Building for Production

```bash
npm run electron:build
```

This will create platform-specific distributables in the `release/` directory.

## Usage

1. **First Launch**: The app will prompt you to:
   - Select your OBS recording folder
   - (Optional) Enter your Riot API key

2. **Review VODs**:
   - Browse your VODs in the main list
   - Click a VOD to open it
   - Watch the video and write your review
   - Reviews auto-save as you type

3. **Link Match Metadata** (Optional):
   - Enter a match ID in the VOD detail view
   - The app will fetch and display match metadata

## Technology Stack

- **Electron**: Desktop application framework
- **React + TypeScript**: Frontend UI
- **Vite**: Build tool and dev server
- **better-sqlite3**: Local database for reviews and metadata
- **Riot API**: Match metadata (optional)

## Development

The project structure:

```
├── electron/          # Electron main process
│   ├── main.ts       # Main entry point
│   ├── preload.ts    # Preload script (IPC bridge)
│   ├── database.ts   # SQLite database layer
│   ├── vod-scanner.ts # File system scanning
│   └── riot-api.ts   # Riot API integration
├── src/              # React frontend
│   ├── components/   # React components
│   ├── types/        # TypeScript type definitions
│   └── App.tsx       # Main app component
└── dist-electron/    # Compiled Electron code (generated)
```

## License

MIT
