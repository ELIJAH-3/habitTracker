# Rate Your Day

A single-page, offline-friendly, printable daily-rating tracker. Each day is
scored from **1** (10 % green - very pale) to **10** (100 % green - deep and
vibrant). Only the tracker is on screen, plus a small semi-transparent row
of controls in the bottom-right corner.

Today's date is always outlined with a **bright orange border** so it is
easy to spot at a glance.

Typography is [JetBrains Mono](https://www.jetbrains.com/lp/mono/); a
common monospace fallback (Cascadia Code, Fira Code, Consolas) is used if
the font is not installed.

## Themes

A **light** paper-cream theme and a **dark** near-black theme are included;
use the `theme` button in the bottom-right corner to toggle. The choice is
persisted per browser.

## Files

- `index.html`               - page layout
- `styles.css`               - full-viewport, no-scroll styling (+ print)
- `script.js`                - SVG tracker, storage, PDF export
- `vendor/html2canvas.min.js`- bundled PDF-export dependency (no CDN)
- `vendor/jspdf.umd.min.js`  - bundled PDF-export dependency (no CDN)
- `habit-tracker-data.json`  - your saved progress

No build step, no server. Just open `index.html` in a modern browser.

## Using the tracker

- **Left-click** a day cell -> a small prompt asks for a **1..10** rating.
  Leave the prompt blank or type `0` to clear the day.
- **Right-click** a day cell -> immediately clears the rating.
- **Click the year** in the middle of the wheel to change the calendar year.
- Hover any cell for a tooltip showing the ISO date and current rating.

### Keyboard shortcuts

| Key         | Action                                                          |
|-------------|-----------------------------------------------------------------|
| `T`         | Toggle light / dark theme                                       |
| `H` or `M`  | Hide / show the corner menu + status line (clean screenshots)   |

Shortcuts ignore modifiers (`Ctrl`/`Alt`/`Meta`) and typing inside
an `<input>` / `<textarea>`, so they don't fight with browser shortcuts.

## Layout

- Outermost ring = **December**, innermost = **July** of the selected year
- 31 rounded pill-shaped cells per ring (unused dates like Feb 30 are omitted)
- The top-left quadrant is intentionally empty and holds the month labels
- The year sits in the middle of the wheel and is clickable

## Saving progress

Every change is auto-saved to your browser (`localStorage`). 

To persist changes across devices, incognito tabs, and different browsers automatically, the app can sync to a free cloud JSON store like **JSONBin.io**.

### One-time setup for Cloud Sync (JSONBin)

1. Go to [JSONBin.io](https://jsonbin.io/) and create a free account.
2. Create a new empty bin with this exact content: `{"startYear": 2026, "ratings": {}}`
3. Copy the **Bin ID** from the URL (e.g., `64a...`).
4. Go to your JSONBin API Keys and copy your **Access Key** (or Master Key).
5. In your Render.com dashboard, go to your Static Site -> **Environment**, and add two variables:
   - `JSONBIN_ID`: Your Bin ID
   - `JSONBIN_KEY`: Your Access Key
6. Change your Render build command to: `./build.sh`

That's it! Render will inject your keys into the JavaScript during the build process. From now on:

- Every rating change is saved locally instantly, and **auto-syncs to the cloud** in the background (debounced by 2 seconds).
- When you open the app (even in an incognito tab or on your phone), it will fetch the latest data from the cloud automatically.
- Your keys are never committed to your Git repository.

### JSON schema

```json
{
    "startYear": 2026,
    "ratings": {
        "2026-07-01": 8,
        "2026-07-02": 5,
        "2026-12-31": 10
    }
}
```

## Exporting a PDF

- **pdf** button - renders the tracker via `html2canvas` and drops it centered
  on an A4 landscape page via `jsPDF` (both loaded from a CDN).
- **print** button - opens the browser print dialog; choose "Save as PDF" for
  a crisp vector PDF that works fully offline.

The floating control row is auto-hidden in both PDF and Print output.
