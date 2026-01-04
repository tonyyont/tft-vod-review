# Quick Start Guide

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build Electron main process:**
   ```bash
   npm run build:electron
   ```

3. **Start development:**
   ```bash
   npm run electron:dev
   ```

This will:
- Compile the Electron TypeScript files
- Start the Vite dev server (React frontend)
- Launch the Electron app

## First Run

1. When the app opens, you'll see the setup wizard
2. Click "Select Folder" and choose your OBS recording folder
3. (Optional) Enter your Riot API key
4. Click "Get Started"

## Development Notes

- The Electron main process code is in `electron/`
- The React frontend is in `src/`
- Database is stored in the Electron user data directory
- Hot reload works for React code (Vite)
- Electron code requires rebuild when changed (run `npm run build:electron`)

## Troubleshooting

### "Cannot find module" errors
- Make sure you've run `npm run build:electron` first
- Check that `dist-electron/` directory exists

### Database errors
- The database is created automatically on first run
- Database location: Electron user data directory (varies by OS)

### Video playback issues
- Make sure MP4 files are in a supported format (H.264 is most compatible)
- Check that file paths are accessible

## Building for Production

```bash
npm run electron:build
```

This creates platform-specific distributables in `release/`.
