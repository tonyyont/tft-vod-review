# Product Specification: Local TFT VOD Review Tool (v0)

## Document Information
- **Version**: 0.1
- **Status**: Draft
- **Last Updated**: 2024
- **Product**: Local TFT VOD Review Tool
- **Phase**: MVP (v0)

---

## 1. Executive Summary

### TL;DR
A local-first VOD review tool for TFT players that pairs each OBS recording with match metadata and a single structured review field—so players actually review games instead of building systems.

### Product Vision
Reduce friction to near-zero so competitive TFT players consistently review their games and improve faster.

### Core Value Proposition
- **One VOD. One text review. Real match context.**
- No setup. No structure. No excuses.
- Write three sentences. That's enough.

---

## 2. Problem Statement

### The Core Problem
Most TFT improvement advice assumes players will review their games. In reality:

1. **OBS produces raw, contextless video files**
   - Videos sit in folders with meaningless filenames
   - No connection to match outcomes or decisions
   - No way to quickly identify which games matter

2. **Match results live in separate tools**
   - Tactics.tools requires manual lookups
   - Riot API data is separate from video files
   - No unified context

3. **Writing reviews requires setup and discipline**
   - Players need to open multiple tools
   - Mental overhead of "doing it right"
   - No clear starting point

### The Result
- VODs pile up unreviewed
- Lessons are forgotten
- Feedback loops break down
- **The biggest problem is not missing features — it's too much friction to start reviewing at all**

---

## 3. Target User

### Primary User: Competitive Solo TFT Player

**Characteristics:**
- Records most games via OBS
- Actively seeks to improve decision-making
- Reviews alone (no coach, no audience)
- Values speed and privacy over polish
- Plays regularly (3+ sessions per week)
- Rank: Diamond or above (aspirationally)

**Goals:**
- Quickly identify mistakes and patterns
- Remember key lessons from recent games
- Track improvement over time
- Review efficiently between sessions

**Pain Points:**
- Too much friction to start reviewing
- Videos feel disconnected from match data
- No clear "minimum viable review"
- Existing tools feel like work, not improvement

### Not For:
- ❌ Content creators (need audience features)
- ❌ Casual or purely for-fun players (no improvement motivation)
- ❌ Teams or shared workflows (local-only, solo-focused)

---

## 4. Solution Overview

### Core Concept
A local-only review surface that reduces review to its smallest useful unit.

### Key Design Principles

1. **Completion over Structure**
   - Writing anything is more valuable than writing the "right" thing
   - Free-form text beats structured fields
   - One field is faster than many

2. **Context over Analysis**
   - Match metadata provides context, not analysis
   - User does the thinking; tool provides the facts
   - No AI summaries or auto-insights

3. **Local over Cloud**
   - Privacy-first (no uploads)
   - Fast (no network latency)
   - Simple (no auth, no sync complexity)

4. **Speed over Polish**
   - Fast enough to use between games
   - No required fields
   - One primary action per screen

---

## 5. Feature Requirements

### 5.1 Local VOD Library

**Description:**
Automatically scan and display MP4 files from a user-specified OBS recording folder.

**Requirements:**

1. **Folder Selection**
   - User specifies OBS recording folder path on first launch
   - Folder path stored locally (config file)
   - User can change folder path in settings

2. **Automatic Scanning**
   - Scan folder on app launch
   - Detect new MP4 files automatically (watch folder or manual refresh)
   - Support nested folders (if OBS creates subfolders)

3. **VOD List Display**
   - List all MP4 files in selected folder
   - Show filename (or derived display name)
   - Show file creation/modification date
   - Show file size
   - Visual indicator for review status:
     - ✅ Has review (non-empty text)
     - ⭕ No review (empty or missing)
   - Sort options:
     - Default: Newest first (by file date)
     - Optional: Oldest first, Alphabetical

4. **File Management**
   - Read-only access (no file modification)
   - No file duplication (references only)
   - Handle deleted files gracefully (show as missing if review exists)

**Acceptance Criteria:**
- User can select OBS folder and see all MP4 files listed
- New recordings appear in list without restart
- Clear visual distinction between reviewed and unreviewed VODs

---

### 5.2 Single Review Field per VOD

**Description:**
One large, free-form text field associated with each VOD file.

**Requirements:**

1. **Review Storage**
   - Store review text locally (JSON or SQLite)
   - Key: file path or hash (reliable identifier)
   - Value: review text (string)
   - Auto-save as user types (or save on blur/close)

2. **Review Interface**
   - Large text area (multiline, scrollable)
   - Full-width design
   - Plain text input (no rich text, no markdown)
   - Optional: word count or character count (non-intrusive)

3. **Review Access**
   - Click VOD in list → open review view
   - Review field visible alongside or below video player
   - Review persists across sessions

4. **Review Status**
   - Empty string = no review
   - Non-empty string = has review
   - No minimum length requirement
   - No maximum length (reasonable limit: 10,000 chars)

**Design Notes:**
- Optimize for completion, not structure
- Designed for quick notes like:
  - "What went wrong"
  - "What to focus on next time"
  - "One thing to improve"

**Acceptance Criteria:**
- User can type review for any VOD
- Review saves automatically
- Review persists after app restart
- Review status accurately reflects presence of text

---

### 5.3 Video Playback

**Description:**
Play MP4 files directly in the application.

**Requirements:**

1. **Video Player**
   - Embedded video player (HTML5 video element or equivalent)
   - Standard controls: play, pause, seek, volume, fullscreen
   - Support common MP4 codecs (H.264, H.265 if possible)

2. **Player Placement**
   - Video player and review field on same screen
   - Side-by-side or stacked layout (responsive)
   - Video player takes reasonable portion of screen (not tiny, not overwhelming)

3. **Performance**
   - Load video on demand (when VOD selected)
   - Handle large files gracefully (10+ GB)
   - No pre-loading of multiple videos

**Acceptance Criteria:**
- User can play any MP4 file from the list
- Video plays smoothly for standard OBS recordings
- Player controls work as expected

---

### 5.4 Match Metadata (Read-Only)

**Description:**
Link VODs to TFT matches and display match metadata for context.

**Requirements:**

1. **Match Linking**
   - User manually links VOD to match ID (input field)
   - Match ID stored with VOD record
   - One match ID per VOD (simple 1:1 relationship)
   - Optional: Auto-detect match ID from filename if pattern exists

2. **Metadata Fetching**
   - Fetch match data from Riot API (or tactics.tools if available)
   - Cache metadata locally (avoid repeated API calls)
   - Handle API errors gracefully (show error state, allow retry)

3. **Metadata Display (Read-Only)**
   - Display key match information:
     - **Placement** (rank: 1-8)
     - **Augments** (list of 3 augments)
     - **Traits** (active traits and levels)
     - **Final board** (champions/items)
   - Read-only display (no editing)
   - Format clearly and compactly

4. **API Integration**
   - Riot API integration (requires API key from user)
   - Store API key securely (local storage, encrypted if possible)
   - Rate limit handling (respect API limits)
   - Optional: Fallback to tactics.tools if Riot API unavailable

**Design Notes:**
- Metadata provides context, not analysis
- User does the thinking; tool provides the facts
- Metadata is helpful but not required (VOD can exist without match link)

**Acceptance Criteria:**
- User can link VOD to match ID
- Match metadata displays correctly when linked
- Metadata persists across sessions (cached)
- Unlinked VODs work normally (no metadata required)

---

### 5.5 Application Shell

**Description:**
Basic application structure and navigation.

**Requirements:**

1. **Navigation**
   - Single main view (VOD list)
   - Click VOD → open detail view (video + review + metadata)
   - Back button or close button to return to list
   - Breadcrumb or clear navigation state

2. **Settings**
   - Folder path selection
   - API key input (for Riot API)
   - Optional: Theme preference (light/dark)
   - Settings accessible from main view

3. **Data Storage**
   - All data stored locally
   - Reviews: JSON or SQLite database
   - Metadata cache: JSON or SQLite database
   - Config: JSON or config file
   - Data location: User data directory (OS-appropriate)

4. **First Run Experience**
   - Welcome screen or setup wizard
   - Prompt for OBS folder path
   - Prompt for Riot API key (optional, can skip)
   - Brief explanation of core workflow

**Acceptance Criteria:**
- User can navigate between list and detail views
- Settings are accessible and persistent
- All data stored locally (no cloud sync)
- First-time user can complete setup in < 2 minutes

---

## 6. User Stories

### Epic 1: View and Manage VODs

**Story 1.1: List All VODs**
- **As a** competitive TFT player
- **I want to** see all my OBS recordings in one place
- **So that** I can quickly identify which games need review

**Story 1.2: Identify Reviewed VODs**
- **As a** competitive TFT player
- **I want to** see which VODs have reviews and which don't
- **So that** I know what work is left to do

**Story 1.3: Select OBS Folder**
- **As a** competitive TFT player
- **I want to** point the app to my OBS recording folder
- **So that** it automatically finds my recordings

---

### Epic 2: Write Reviews

**Story 2.1: Write Simple Review**
- **As a** competitive TFT player
- **I want to** write a free-form review for each VOD
- **So that** I can capture my thoughts without friction

**Story 2.2: Save Review Automatically**
- **As a** competitive TFT player
- **I want** my review text to save automatically
- **So that** I don't lose my work

**Story 2.3: Review Persists**
- **As a** competitive TFT player
- **I want** my reviews to persist across app sessions
- **So that** I can build a review library over time

---

### Epic 3: View Match Context

**Story 3.1: Link VOD to Match**
- **As a** competitive TFT player
- **I want to** link a VOD to a specific match ID
- **So that** I can see match metadata alongside the video

**Story 3.2: View Match Metadata**
- **As a** competitive TFT player
- **I want to** see placement, augments, traits, and final board for a match
- **So that** I have context while reviewing the VOD

**Story 3.3: Metadata Caching**
- **As a** competitive TFT player
- **I want** match metadata to be cached locally
- **So that** I don't need to fetch it repeatedly

---

### Epic 4: Watch Videos

**Story 4.1: Play VOD**
- **As a** competitive TFT player
- **I want to** play the video file directly in the app
- **So that** I can watch and review simultaneously

**Story 4.2: Video Controls**
- **As a** competitive TFT player
- **I want** standard video controls (play, pause, seek, volume)
- **So that** I can navigate the video while writing my review

---

## 7. Technical Requirements

### 7.1 Platform & Technology

**Options:**
1. **Electron + React/Vue** (cross-platform desktop app)
2. **Tauri + React/Vue** (lightweight alternative to Electron)
3. **Native (Swift/Objective-C for macOS, C# for Windows)** (platform-specific)

**Recommendation:** Electron or Tauri for cross-platform support and faster development.

### 7.2 Core Technologies

- **Frontend Framework:** React (or Vue/Svelte)
- **Video Player:** HTML5 video element (or VLC.js for better codec support)
- **Storage:** SQLite (via better-sqlite3 or sql.js) or JSON files
- **File System:** Node.js fs API (Electron) or Rust std::fs (Tauri)
- **API Client:** Fetch or axios for Riot API calls

### 7.3 Data Storage

**Database Schema (SQLite):**

```sql
-- VODs table
CREATE TABLE vods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  created_at DATETIME,
  modified_at DATETIME,
  match_id TEXT,  -- Riot match ID (optional)
  review_text TEXT  -- Review content (optional)
);

-- Match metadata cache
CREATE TABLE match_metadata (
  match_id TEXT PRIMARY KEY,
  placement INTEGER,
  augments TEXT,  -- JSON array
  traits TEXT,    -- JSON object
  final_board TEXT,  -- JSON array
  fetched_at DATETIME,
  raw_data TEXT  -- Full API response (JSON)
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 7.4 API Integration

**Riot API:**
- Endpoint: `https://{region}.api.riotgames.com/tft/match/v1/matches/{matchId}`
- Authentication: API key (user-provided)
- Rate limits: Respect Riot API rate limits (100 requests per 2 minutes)
- Caching: Cache all fetched matches locally (never re-fetch)

**Alternative:** Tactics.tools API (if available and accessible)

### 7.5 File Handling

- **Supported Formats:** MP4 (primary), optionally MKV, MOV
- **File Size:** Handle files up to 20GB
- **Performance:** Lazy loading (don't scan entire folder tree on startup if huge)
- **Error Handling:** Handle missing files, corrupted files, permission errors

### 7.6 Security & Privacy

- **No Network Calls (except API):** All data stays local
- **API Key Storage:** Store securely (OS keychain if available, encrypted file otherwise)
- **No Telemetry:** No analytics, no tracking, no external services
- **File Access:** Read-only access to video files (never modify or delete)

---

## 8. UX/UI Guidelines

### 8.1 Design Principles

1. **One Primary Action Per Screen**
   - List view: Browse and select VOD
   - Detail view: Write review

2. **No Required Fields**
   - User can skip match linking
   - User can leave review empty
   - User can use app without API key

3. **No Premature Structure**
   - No tags, no ratings, no categories (v0)
   - No templates or prompts (v0)
   - Free-form text only

4. **Fast Enough Between Games**
   - App launches in < 3 seconds
   - VOD list loads in < 1 second
   - Video starts playing in < 2 seconds

5. **Completion Over Perfection**
   - Emphasize "write something" over "write well"
   - No validation errors for short reviews
   - Success = user typed at least one sentence

### 8.2 Visual Design

**Layout:**
- **List View:**
  - Left/center: VOD list (table or cards)
  - Right/sidebar: Optional stats (total VODs, % reviewed)
  - Top: Search/filter (optional, v0.1)

- **Detail View:**
  - Top: Video player (60-70% of height)
  - Bottom: Review text area (30-40% of height)
  - Sidebar or below video: Match metadata (if linked)

**Colors:**
- Minimal, functional palette
- High contrast for readability
- Review status indicators: Green (has review), Gray (no review)

**Typography:**
- Clean, readable fonts
- Adequate line height for review text area
- Clear hierarchy (VOD name > metadata > review)

### 8.3 Interaction Patterns

- **Click VOD** → Open detail view
- **Type in review field** → Auto-save (debounced, every 2-3 seconds)
- **Link match** → Input field for match ID, fetch on submit
- **Back/Close** → Return to list (save review before closing)

---

## 9. Success Metrics

### Primary Metrics

1. **% of VODs with Non-Empty Review**
   - Target: > 40% after 2 weeks of usage
   - Measure: Count VODs with review_text.length > 0 / Total VODs

2. **Average Time from VOD Creation → Review**
   - Target: < 24 hours (median)
   - Measure: Time between file creation date and first review save

3. **Reviews per Play Session**
   - Target: 1+ review per session (if user opens app)
   - Measure: Reviews written / Sessions where app was opened

### Secondary Metrics

4. **% of VODs Linked to Match Metadata**
   - Target: > 60% (optional feature, but useful)
   - Measure: Count VODs with match_id / Total VODs

5. **Repeat Weekly Usage**
   - Target: 3+ sessions per week (for active users)
   - Measure: Sessions per week (user opens app and interacts)

### Qualitative Metrics

- User feedback:
  - "I actually wrote something"
  - "I remember what I was working on"
  - "This is faster than my old process"

---

## 10. Out of Scope (v0)

The following features are **explicitly excluded** from v0:

- ❌ Timestamped notes (annotations at specific times)
- ❌ Tags or categories
- ❌ Ratings or scores
- ❌ Analytics or statistics (beyond basic counts)
- ❌ Cloud sync
- ❌ Social features (sharing, comments)
- ❌ Search functionality (can add in v0.1)
- ❌ Export/import reviews
- ❌ Multiple review fields or structured templates
- ❌ AI summaries or auto-insights
- ❌ Video editing or clipping
- ❌ Multi-user or team features

**Rationale:** Each excluded feature adds complexity and friction. v0 succeeds if users write reviews consistently. Structure can come later.

---

## 11. Future Extensions (Only If v0 Succeeds)

If users adopt v0 and the core habit sticks, consider:

### v0.1 (Quick Wins)
- Search/filter VODs by filename or review content
- Basic stats dashboard (% reviewed, review count over time)
- Export reviews to text file

### v0.2 (Optional Structure)
- Optional prompts ("What went wrong?", "What to improve?")
- Optional tags (extracted from text or manual)
- Optional ratings (1-5 stars, simple)

### v1.0 (Pattern Recognition)
- Session-level summaries (aggregate reviews from one play session)
- Pattern surfacing (common themes across reviews)
- Review search (full-text search across all reviews)

### Future (Only If Clearly Needed)
- Cloud sync (optional, user-controlled)
- Mobile companion (view reviews on phone)
- Integration with other TFT tools (tactics.tools, Mobalytics)

**Decision Framework:** Add features only if:
1. Users consistently use v0 (write reviews regularly)
2. Feature request appears repeatedly
3. Feature doesn't add friction to core workflow

---

## 12. Implementation Phases

### Phase 1: Core MVP (v0)
- ✅ Local file scanning
- ✅ VOD list display
- ✅ Single review field
- ✅ Review persistence
- ✅ Basic video playback
- ✅ Match metadata linking (manual)
- ✅ Match metadata display

**Timeline Estimate:** 4-6 weeks (solo developer)

### Phase 2: Polish & Reliability (v0.0.1)
- Error handling improvements
- Performance optimization
- UI polish
- Settings persistence
- First-run experience

**Timeline Estimate:** 1-2 weeks

### Phase 3: User Testing
- Release to 5-10 target users
- Collect feedback
- Measure success metrics
- Iterate based on usage patterns

**Timeline Estimate:** 2-3 weeks

---

## 13. Risk Assessment

### Technical Risks

1. **Video Codec Compatibility**
   - Risk: Some OBS recordings may use unsupported codecs
   - Mitigation: Use robust video player (VLC.js), provide codec info to user

2. **Large File Handling**
   - Risk: 10+ GB files may cause performance issues
   - Mitigation: Stream video (don't load entire file), lazy loading

3. **API Rate Limits**
   - Risk: Riot API rate limits may prevent metadata fetching
   - Mitigation: Aggressive caching, batch requests if possible

### Product Risks

1. **Users Don't Write Reviews**
   - Risk: Even with low friction, users may not engage
   - Mitigation: Focus on UX polish, make writing feel rewarding

2. **Feature Creep**
   - Risk: Adding features too early, increasing friction
   - Mitigation: Strict v0 scope, defer all non-essential features

3. **OBS Folder Structure Changes**
   - Risk: OBS updates may change folder structure
   - Mitigation: Flexible folder scanning, user-configurable paths

---

## 14. Open Questions

1. **Match ID Input Method**
   - Manual input vs. auto-detect from filename?
   - Should we support multiple match ID formats?

2. **Video Player Choice**
   - HTML5 video (simple, limited codecs) vs. VLC.js (complex, better support)?
   - Recommendation: Start with HTML5, upgrade if needed

3. **Review Storage Format**
   - SQLite (structured, queryable) vs. JSON (simple, human-readable)?
   - Recommendation: SQLite for future extensibility

4. **Cross-Platform Priority**
   - macOS first, then Windows/Linux?
   - Or build cross-platform from start?

5. **Offline-First Architecture**
   - Should metadata fetching work offline (cache-only mode)?
   - Recommendation: Yes, cache-first, fetch on demand

---

## 15. Definition of Done

v0 is considered "done" when:

1. ✅ User can select OBS folder and see VOD list
2. ✅ User can play any VOD in the app
3. ✅ User can write and save a review for any VOD
4. ✅ User can link VOD to match and view metadata
5. ✅ All data persists locally across sessions
6. ✅ App works offline (except metadata fetching)
7. ✅ No critical bugs or crashes
8. ✅ Success metrics can be measured

**Not required for v0:**
- ❌ Perfect UI/UX (functional is enough)
- ❌ Extensive error handling (graceful degradation is enough)
- ❌ Comprehensive documentation (README is enough)
- ❌ All edge cases handled (common cases work)

---

## Appendix A: Example User Flows

### Flow 1: First-Time User

1. Launch app
2. See welcome screen / setup wizard
3. Select OBS folder path
4. (Optional) Enter Riot API key
5. See VOD list populated
6. Click first VOD
7. See video player and empty review field
8. Type review
9. Review auto-saves
10. Return to list (VOD now shows as reviewed)

**Time to first review:** < 3 minutes

### Flow 2: Returning User (Daily Review)

1. Launch app
2. See VOD list (new recordings since last session)
3. Click unreviewed VOD
4. (Optional) Link match ID
5. Watch video (or skip)
6. Type review
7. Return to list
8. Repeat for 2-3 VODs

**Time per review:** 2-5 minutes

### Flow 3: Quick Review Between Games

1. Launch app (already open)
2. See newest unreviewed VOD
3. Click VOD
4. Type 2-3 sentences quickly
5. Close detail view
6. Return to game

**Time:** < 1 minute

---

## Appendix B: Technical Architecture Sketch

```
┌─────────────────────────────────────┐
│         Application Shell           │
│  (Electron/Tauri Main Process)      │
└─────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼────────┐  ┌─────▼──────────┐
│  Frontend UI   │  │  File System   │
│  (React/Vue)   │  │  (Node/Rust)   │
└───────┬────────┘  └─────┬──────────┘
        │                 │
        │          ┌──────▼──────────┐
        │          │  Local Storage  │
        │          │  (SQLite/JSON)  │
        │          └─────────────────┘
        │
┌───────▼────────┐
│  Video Player  │
│  (HTML5/VLC)   │
└────────────────┘

┌─────────────────┐
│  Riot API       │
│  (External)     │
└─────────────────┘
```

---

## Document History

- **v0.1** (Initial): Created from 1-pager specification

---

**End of Product Specification**
