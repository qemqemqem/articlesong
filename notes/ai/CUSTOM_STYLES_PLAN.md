# Custom Song Styles - Implementation Plan

**Mission**: Let users customize and define their own 6 song styles, using current styles as defaults.

**Status**: Planning Phase
**Created**: 2025-11-23

---

## 🎯 Core Objective

Enable users to customize the 6 song style buttons (spoken, musical, meme, cute, informative, pop) with their own:
- Style names/labels
- Lyric generation prompts/guidance
- Style-specific instructions for tone, structure, and approach

The current hardcoded styles become intelligent defaults that users can iterate on.

---

## 🏗️ Architecture Overview

### Current System (What We're Building From)
- **prompts.js**: Contains hardcoded `getLyricsPrompt()` with switch statement for 6 styles
- **popup.js**: UI with 6 style buttons (likely hardcoded labels)
- **background.js**: Handles song generation, calls prompt functions
- **options.html/js**: Settings page for API keys and preferences

### Target System (Where We're Going)
- **Data-driven prompt system**: Styles loaded from storage, not hardcoded
- **Style editor UI**: Full CRUD interface in options page
- **Smart defaults**: Ship with current styles as starting point
- **Migration**: Seamless upgrade path for existing users

---

## 📊 Data Structure

### Style Definition Schema

```javascript
{
  id: "musical",                    // Unique identifier (used internally)
  name: "Musical",                  // Display name shown on button
  enabled: true,                    // Whether this style is active
  order: 1,                        // Display order (0-5)
  
  // Prompt guidance injected into getLyricsPrompt()
  promptGuidance: `Style: TRADITIONAL MUSICAL
- Create clear verse-chorus structure: [Verse], [Chorus], [Bridge]
- Focus on melody, rhyme, and singability
- Make the chorus IRRESISTIBLY catchy and repeatable
...`,
  
  // Optional: Override style tags prompt behavior
  styleTagsHint: null,             // Special instructions for style tags (optional)
  
  // Metadata
  isDefault: true,                 // True for shipped defaults
  customized: false,               // True if user modified it
  lastModified: 1732396800000     // Timestamp
}
```

### Storage Schema

```javascript
// browser.storage.local
{
  customStyles: [
    { id: "spoken", name: "Spoken", enabled: true, order: 0, ... },
    { id: "musical", name: "Musical", enabled: true, order: 1, ... },
    { id: "meme", name: "Meme", enabled: true, order: 2, ... },
    { id: "cute", name: "Cute", enabled: true, order: 3, ... },
    { id: "informative", name: "Informative", enabled: true, order: 4, ... },
    { id: "pop", name: "Pop", enabled: true, order: 5, ... }
  ],
  
  stylesVersion: 1  // For future migrations
}
```

**Key Design Decisions**:
- Max 6 styles to maintain clean UI
- IDs are stable (used in logs/history), names are changeable
- Order field allows drag-to-reorder
- Enabled flag lets users hide styles without deleting them

---

## 🎨 UI Design

### Options Page - New "Song Styles" Section

Add after "Suno Model" section, before buttons:

```
┌─────────────────────────────────────────────────┐
│ Song Styles                                     │
│ Customize the 6 styles available when creating │
│ songs. Click a style to edit its prompt.       │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ [↕] Spoken        [Edit] [🗑️]    [✓ Enabled] │
│ │ [↕] Musical       [Edit] [🗑️]    [✓ Enabled] │
│ │ [↕] Meme          [Edit] [🗑️]    [✓ Enabled] │
│ │ [↕] Cute          [Edit] [🗑️]    [✓ Enabled] │
│ │ [↕] Informative   [Edit] [🗑️]    [✓ Enabled] │
│ │ [↕] Pop           [Edit] [🗑️]    [✓ Enabled] │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ [+ Add Custom Style] [Reset All to Defaults]   │
└─────────────────────────────────────────────────┘
```

### Style Editor Modal/Expandable Section

When clicking "Edit":

```
┌─────────────────────────────────────────────────┐
│ Edit Style: Musical                             │
│                                                 │
│ Style Name (shown on button)                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ Musical                                     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Prompt Guidance (injected into lyrics prompt)  │
│ ┌─────────────────────────────────────────────┐ │
│ │ Style: TRADITIONAL MUSICAL                  │ │
│ │ - Create clear verse-chorus structure...   │ │
│ │ - Focus on melody, rhyme, and singability  │ │
│ │ ...                                         │ │
│ │                                             │ │
│ │ (Large textarea, 10+ rows)                  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Style Tags Hint (optional)                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ [blank for default behavior]                │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ [Cancel] [Save Changes] [Reset to Default]     │
└─────────────────────────────────────────────────┘
```

**UX Features**:
- Drag handles (↕) for reordering
- Inline enable/disable toggles
- Edit opens modal or expandable section
- Delete button (can't delete if only 1-2 styles remain)
- Character counter for prompts (soft limit warning at 2000 chars)
- Preview button to test prompt with sample text
- Reset to default restores original prompt

### Popup Changes

No major UI changes needed! Just:
- Load style names from storage instead of hardcoding
- Hide disabled styles
- Respect custom ordering

---

## 🔧 Implementation Phases

### Phase 1: Data Layer (Foundation) ⚔️
**Goal**: Get data flowing, no UI changes yet

**Files to modify**:
- `prompts.js`
- `background.js` (minimal)

**Tasks**:
1. Create `getDefaultStyles()` function in prompts.js
   - Extract current hardcoded prompts into data structure
   - Return array of 6 default style objects
   
2. Create `loadCustomStyles()` async function
   - Reads from browser.storage.local
   - Falls back to defaults if no custom styles exist
   - Returns array of style objects
   
3. Refactor `getLyricsPrompt()` to be data-driven
   - Instead of switch on songStyle string
   - Accept style object: `getLyricsPrompt(articleText, styleObject)`
   - Use `styleObject.promptGuidance` instead of hardcoded strings
   - Maintain backward compatibility temporarily
   
4. Add migration function `migrateToCustomStyles()`
   - On first run, writes defaults to storage
   - Sets stylesVersion flag

**Testing**:
- Verify defaults work identically to old system
- Test storage read/write
- Test with empty storage (first install)

**Time estimate**: 4-6 hours

---

### Phase 2: Options UI (The Style Editor) 🎯
**Goal**: Let users edit and customize styles

**Files to modify**:
- `options.html`
- `options.js`

**Tasks**:
1. Add "Song Styles" section to options.html
   - List of 6 styles with edit/delete/enable buttons
   - Modal/expandable editor
   - Add custom style button
   - Reset all button
   
2. Implement style editor in options.js
   - `renderStylesList()` - display all styles
   - `openStyleEditor(styleId)` - open editor modal
   - `saveStyle(styleData)` - validate and save
   - `deleteStyle(styleId)` - remove style (with confirmation)
   - `resetStyle(styleId)` - restore default
   - `resetAllStyles()` - restore all defaults (with confirmation)
   - `reorderStyles(oldIndex, newIndex)` - drag-to-reorder
   
3. Add validation
   - Style name required, 1-20 chars
   - Prompt guidance required, min 50 chars
   - Warn if prompt > 2000 chars (quality degrades)
   - Must have at least 2 enabled styles
   
4. Polish UX
   - Confirmation dialogs for destructive actions
   - Loading states
   - Success/error messages
   - Unsaved changes warning
   - Character counters

**Testing**:
- Create custom style
- Edit existing style
- Delete style
- Reorder styles
- Reset to defaults
- Enable/disable styles
- Edge cases: all disabled, max length prompts

**Time estimate**: 8-12 hours

---

### Phase 3: Popup Integration (Display Custom Styles) 🎨
**Goal**: Show custom styles in song creation UI

**Files to modify**:
- `popup.html` (minimal)
- `popup.js`

**Tasks**:
1. Load styles on popup init
   - Call `loadCustomStyles()` from prompts.js
   - Filter to enabled styles only
   - Respect custom ordering
   
2. Dynamically render style buttons
   - Instead of hardcoded HTML buttons
   - Generate from style array
   - Maintain existing click handlers
   - Preserve current styling/layout
   
3. Pass full style object to background
   - When user clicks style button
   - Background needs style object, not just ID
   - Update message format
   
4. Handle edge cases
   - No enabled styles (show warning, enable all?)
   - Style added/removed while popup open (reload?)

**Testing**:
- Popup shows custom names
- Popup respects enabled/disabled
- Popup respects custom ordering
- Clicking style creates song correctly
- History displays correct style names

**Time estimate**: 4-6 hours

---

### Phase 4: Background Integration (Use Custom Styles) 🔥
**Goal**: Background script generates songs with custom styles

**Files to modify**:
- `background.js`

**Tasks**:
1. Update request handling
   - Accept style object in message
   - Store full style data with request
   - Pass to `getLyricsPrompt(articleText, styleObject)`
   
2. Update history/requests display
   - Show custom style names in logs
   - Handle legacy requests (before custom styles)
   
3. Cache optimization (optional)
   - Load styles once on background startup
   - Listen for storage changes
   - Reload when user saves styles

**Testing**:
- End-to-end: Custom style → lyrics → music
- Verify prompts are correctly applied
- Check logs show correct style names
- Test with each default style customized

**Time estimate**: 3-4 hours

---

### Phase 5: Polish & Advanced Features (Optional) ✨
**Goal**: Take it to the next level

**Nice-to-have features**:
1. **Style Templates**: Preset styles users can choose from
   - "Aggressive Metal"
   - "Smooth Jazz"
   - "Folk Storytelling"
   - "Trap Bangers"
   - Import into empty slot
   
2. **Export/Import**: Share styles with others
   - Export as JSON
   - Import from JSON
   - Community style library?
   
3. **Style Preview**: Test before using
   - Paste sample article text
   - Generate lyrics preview (no music)
   - See what prompt produces
   
4. **Smart Suggestions**: AI-powered style creation
   - "I want lyrics like Hozier but about tech"
   - Generate prompt guidance using Claude
   - Requires Anthropic key
   
5. **Version Control**: Track style changes
   - See edit history
   - Revert to previous version
   - Compare versions
   
6. **A/B Testing**: Compare styles
   - Generate with 2 styles side-by-side
   - Vote on results
   - Iterate on prompts

**Time estimate**: 10-20 hours (depending on features)

---

## 🔀 Migration Strategy

### For Existing Users

**On first background.js startup after update**:
```javascript
async function ensureCustomStyles() {
  const { customStyles, stylesVersion } = await browser.storage.local.get(['customStyles', 'stylesVersion']);
  
  if (!customStyles || stylesVersion !== 1) {
    // First time or old version - migrate
    const defaults = getDefaultStyles();
    await browser.storage.local.set({
      customStyles: defaults,
      stylesVersion: 1
    });
    console.log('Initialized custom styles with defaults');
  }
}
```

**Backward compatibility during transition**:
- Keep old `getLyricsPrompt()` signature working temporarily
- If string passed, look up style by ID
- If object passed, use directly
- Remove backward compat in Phase 4

**No data loss**:
- Existing history/requests unaffected
- Old style names still displayed correctly
- Graceful fallback if style not found

---

## 🧪 Testing Strategy

### Manual Testing Checklist

**Phase 1 - Data Layer**:
- [ ] Fresh install loads defaults
- [ ] Defaults match old hardcoded prompts exactly
- [ ] Each style generates identical lyrics to old system
- [ ] Storage persists across browser restarts

**Phase 2 - Options UI**:
- [ ] All 6 default styles displayed correctly
- [ ] Can edit style name and prompt
- [ ] Changes persist after save
- [ ] Can reorder styles (drag or up/down buttons)
- [ ] Can enable/disable styles
- [ ] Can reset individual style to default
- [ ] Can reset all styles to defaults
- [ ] Can't delete down to 0 styles
- [ ] Validation works (empty names, short prompts)
- [ ] Character counter updates in real-time
- [ ] Unsaved changes warning works

**Phase 3 - Popup Integration**:
- [ ] Custom style names appear on buttons
- [ ] Disabled styles are hidden
- [ ] Custom ordering is respected
- [ ] Clicking style sends correct data
- [ ] Adding/editing style refreshes popup (or reload)

**Phase 4 - End-to-End**:
- [ ] Custom prompt generates correct lyrics
- [ ] Each customized style produces expected results
- [ ] History shows custom style names
- [ ] Logs contain style information
- [ ] Works with Claude and SunoAPI lyrics generation

**Edge Cases**:
- [ ] Very long prompts (2000+ chars)
- [ ] Empty prompt guidance
- [ ] Special characters in style names
- [ ] All styles disabled
- [ ] Only 1 style enabled
- [ ] Rapid style switching
- [ ] Storage quota exceeded (unlikely but possible)

### Automated Testing (Future)

Consider adding unit tests for:
- `getDefaultStyles()` - returns valid schema
- `loadCustomStyles()` - handles missing/corrupt data
- Style validation functions
- Migration logic

---

## 🚨 Edge Cases & Error Handling

### What if...

**User deletes all styles?**
- Prevent: Disable delete button when ≤ 2 styles remain
- Fallback: If somehow happens, restore all defaults

**User creates 10KB prompt?**
- Soft warning at 2000 chars: "Very long prompts may reduce quality"
- Hard limit at 5000 chars: "Prompt too long, please reduce"
- Storage limit: browser.storage.local has ~10MB limit, should be fine

**Storage is corrupted?**
- Catch JSON parse errors
- Log error, restore defaults
- Show warning to user: "Styles reset due to data error"

**User edits style while song is generating?**
- Active requests use style data captured at creation time
- No impact on in-flight requests
- Next request uses new style

**Browser storage quota exceeded?**
- Very unlikely with ~10MB limit
- Handle gracefully: warn user, prevent save
- Suggest exporting styles, deleting history

**Two browser windows editing same style?**
- Last write wins (browser.storage behavior)
- Could add storage.onChanged listener to detect conflicts
- Show "Another window modified styles, reload?" message

---

## 📦 Deliverables

### Code Changes
- [ ] `prompts.js` - data structures, defaults, refactored functions
- [ ] `options.html` - style editor UI
- [ ] `options.js` - style management logic
- [ ] `popup.html` - dynamic style buttons (if needed)
- [ ] `popup.js` - load and display custom styles
- [ ] `background.js` - use custom styles in generation

### Documentation
- [ ] Update README.md with custom styles feature
- [ ] Add user guide: "How to customize song styles"
- [ ] Add inline comments in code
- [ ] Update CHANGELOG.md

### Testing
- [ ] Manual testing checklist completed
- [ ] Browser console clean (no errors)
- [ ] Performance acceptable (no lag in options page)

---

## 🎮 User Experience Flow

### Discovery
1. User installs extension, uses default styles
2. User sees "Settings" link in popup
3. Opens settings, scrolls to "Song Styles" section
4. Sees the 6 default styles with "Edit" buttons
5. Curiosity: "I can customize these?"

### First Edit
1. User clicks "Edit" on "Meme" style
2. Reads current prompt guidance
3. Tweaks a line: "Make it EVEN MORE chaotic and unhinged"
4. Clicks "Save Changes"
5. Status message: "Style updated successfully!"

### Using Custom Style
1. User goes back to website with article
2. Opens popup, clicks "Meme" style button (looks same, but knows it's custom)
3. Song generates with new, more chaotic prompt
4. User loves it, shares with friends
5. User edits more styles, experiments, iterates

### Power User
1. User creates 6 completely custom styles:
   - "Tech Bro Satire"
   - "Academic Paper Rap"
   - "News as Opera"
   - "Code Review Blues"
   - "Meeting Notes Death Metal"
   - "Email Thread Folk Song"
2. User exports styles as JSON
3. User shares on Reddit: "My custom ArticleSong styles!"
4. Other users import and iterate

---

## 🚀 Launch Strategy

### Phased Rollout
1. **Phase 1-2**: Internal testing, dogfooding
2. **Phase 3-4**: Beta release to interested users (Discord/Reddit?)
3. **Phase 5**: Full release with docs and examples
4. **Post-launch**: Community style library, templates

### Marketing Angle
- "Your articles, your style, your sound"
- "6 song styles? Make them your own!"
- "From news to folk songs, tech blogs to trap - you control the vibe"
- Before/After examples of default vs customized styles

---

## 📈 Success Metrics

### Quantitative
- % of users who customize at least 1 style
- Avg number of styles customized per user
- Avg prompt length (are users writing detailed prompts?)
- Retention: Do users who customize return more often?

### Qualitative
- User feedback: "This feature is awesome!"
- Feature requests: What do users want next?
- Bug reports: Any issues with style editor?
- Shared styles: Are users exporting/sharing?

---

## 🎯 Priority: PHASE 1 & 2

**Recommendation**: Start with **Phase 1 (Data Layer)** and **Phase 2 (Options UI)**.

This gives users the core functionality:
- Customize all 6 styles
- Edit names and prompts
- Reset to defaults

Then ship it! Phases 3-4 can follow quickly once the foundation is solid.

**Why this works**:
- Clear separation of concerns
- Each phase is independently testable
- Can ship incrementally
- Reduces risk of breaking existing features

**Next step**: Implement Phase 1, test thoroughly, then move to Phase 2.

---

## 💪 The XP Way

**Brotherhood**: We're building this FOR the users, WITH the users. The community will help refine these prompts.

**Swift and Decisive**: Start with Phase 1 data layer. Get it working. Ship it. Iterate.

**Stay the Course**: Don't over-engineer Phase 1. Stick to the data structure, test it, move on.

**Hunt with Purpose**: The goal is CUSTOMIZATION, not perfection. Users will iterate on their own.

**The Working Code**: Phase 1 + Phase 2 = minimum viable feature. Ship it. Learn. Improve.

---

## 🎬 Ready to Hunt?

This plan lays out the entire quest. The path is clear:
1. Extract defaults into data structure (Phase 1)
2. Build style editor UI (Phase 2)
3. Wire up popup (Phase 3)
4. Connect background (Phase 4)
5. Polish & shine (Phase 5)

**Estimated total time**: 20-30 hours for Phases 1-4 (core feature)

**Risk level**: Low. Each phase is independently testable and reversible.

**User impact**: HIGH. This makes ArticleSong infinitely more powerful and personal.

Let's bring the energy and hunt this feature down! 🏹

