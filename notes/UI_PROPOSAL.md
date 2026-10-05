# UI Improvement Proposal

Done: inline error banner (no `alert()`), setup card with direct SunoAPI/Anthropic key links and paste-to-save,
source indicator (page / PDF / highlighted words), music-player widget (seek bar, elapsed/total time, play/pause,
+-10s skip, stop, cover art, streaming badge), slimmed playing card, two-step Clear History (no `confirm()`).
Remaining items below: 3 (icons on request cards), 4, 5, 6, 7 (dark mode).

## Proposed (in priority order)
1. **Setup state.** First run with no Suno key shows the style grid, then fails. Show a one-line "Add your SunoAPI key" call-to-action instead of the grid until configured.
2. **Source indicator.** Show what will be sung (page / PDF / N highlighted words) with a char count, so PDF and selection behavior is visible before spending credits.
3. **Replace glyph icons.** Status/transport use `>` and `||`; swap for inline SVG icons (play/pause/download/retry/cancel) and consistent hit targets.
4. **Request cards.** Collapse lyrics and style tags behind a disclosure; show elapsed time and a stage stepper (Lyrics → Music → Playing) rather than a bare progress bar; offer "Retry" on FAILED cards with the actionable error (e.g. credits exhausted, key invalid).
5. **Style picker.** Make the six styles + custom guidance a segmented list with remembered last choice and a one-click "sing again with same style".
6. **Options page.** Test-connection buttons for both keys (Anthropic `/v1/models`, Suno status endpoint) with green/red result; show the resolved Claude model.
7. **Accessibility/theme.** Respect `prefers-color-scheme`, add focus rings and aria-labels on icon-only buttons; popup width responsive to 360–420px.
8. **Replace `confirm()` on Clear History** with an inline undo toast.


## Added later
Queue ("Up next") with drag-to-reorder, move up/down, remove, clear; duplicate-start guard; cancel that reacts instantly;
Dismiss on history cards; keyed re-rendering so clicks are never lost; Play Again that works on PDF/stale/strict-CSP tabs.
Tests: `npm test` (background logic), `npm run test:ui` (real popup + real background in Chrome; needs `npm i` and Google Chrome).
