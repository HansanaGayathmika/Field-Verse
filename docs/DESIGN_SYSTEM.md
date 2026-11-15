# Design system

**Audience:** designers and frontend developers working on FieldVerse.

**Visual identity:** modern Earth science, nature and agricultural storytelling. It should feel calm, trustworthy and readable on a cheap phone in sunlight.

## Tokens (`apps/web/src/styles/index.css`, Tailwind v4 `@theme`)

| Token                   | Hex                   | Use                                            |
| ----------------------- | --------------------- | ---------------------------------------------- |
| `forest-900`            | `#102D24`             | Headings, dark sections, primary text on light |
| `forest-950`            | `#0B1F19`             | Hero and footer backgrounds                    |
| `emerald-600`           | `#16805D`             | Primary actions, selection                     |
| `sage-400` / `sage-100` | `#8FBFA5` / `#E7F1EB` | Secondary surfaces, takeaways                  |
| `gold-500`              | `#D6AC60`             | Highlights, "demo" accents, focus ring         |
| `cream-100`             | `#F5F3EB`             | Page background                                |
| `charcoal`              | `#17231D`             | Body text                                      |
| `soil-*`                | browns                | Soil visuals                                   |

**Fonts** are self-hosted through Fontsource, so they work offline and need no Google Fonts call:

- Display: **Fraunces Variable**
- Text: **Manrope Variable**

## Data visualisation

- **Series colours** use the validated reference palette, in fixed order:
  - `series-1` `#2a78d6` — rainfall, and strategy 1
  - `series-2` `#eb6834` — temperature, and strategy 2
  - `series-3` `#1baf7a` — strategy 3
  - vegetation `#008300`

  Colour follows the entity, never its rank.

- **Single-series charts have no legend**, because the title names the series. Multi-series charts have a legend plus text labels.
- **Single axis only.** No dual-axis charts. Recessive grid, 4 px rounded bar ends, 2 px lines.
- **Every chart has:** a question, a title with units, a provenance badge, a takeaway **computed from the data**, an accessible description, a source and period line, and a "Show data table" alternative.
- **Comparison bars** normalise "lower is better" indicators, so a longer bar is always better. Each bar shows "n / 5" as text.
- **Status colours** (good, warning, critical) are reserved for feasibility, and always appear with an icon and a word.

## Provenance badges

| Badge             | Colour | Icon      |
| ----------------- | ------ | --------- |
| Observed          | sky    | satellite |
| Estimated         | soil   | info      |
| From you          | green  | user      |
| Model result      | dark   | sparkles  |
| Illustrative demo | gold   | flask     |
| Not available     | grey   | slash     |

## Components

These are shadcn-style wrappers on Radix in `components/ui`: Button (`primary`, `gold`, `secondary`, `ghost`, `dark`, `outlineLight`, `danger`, `link`), Card, Badge, Accordion, Dialog, Slider, Tabs, Switch and Label.

- Touch targets are at least 40–44 px.
- Radii: 12 px for controls, 16–24 px for cards.

## Motion

Motion is used only to explain:

- crops growing when the season changes;
- roots drawing in;
- rain intensity following real rainfall;
- the hero's three futures.

Everything respects `prefers-reduced-motion` and **low-bandwidth mode**. In those modes, video shows only its poster frame and decorative animation is disabled.

## Video

The satellite timelapses are real NASA GIBS NDVI frames encoded as WebM with an MP4 fallback. Each has a poster image. Playback controls let users pause and step month by month, and the month label stays in sync with the video.

## Mascot — the FieldVerse farmer

The farmer and the farmer-astronaut are hand-built SVGs in `apps/web/src/features/mascot/MascotArt.tsx`. Because they are SVG, each part can move separately:

| Where                                | What he does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login and sign-up page               | Bobs gently, blinks and waves now and then. Looks toward the form when a field is focused. Shakes his head when the server rejects the login. Bounces while the form is submitting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Home page hero (bottom-right corner) | The farmer-astronaut, about 40% of the screen height (on phones he sits below the hero text). A ~1 second "suit up" (flash, then the astronaut appears) plays once, right after login or sign-up. He then floats weightlessly, with twinkling stars. Above him, a looping typewriter greeting in the headline's white-and-gold lettering types one sentence at a time, erases it, then types the next: "Welcome back, Captain Farmer!", "Hi <first name>." and "Your mission control for the next growing season is ready." Screen readers hear the greeting once; with reduced motion all three lines show still. Logged-out visitors see the farmer instead. |

- **Reduced motion:** with `prefers-reduced-motion`, or the app's calm-motion or low-bandwidth settings, all mascot animation stops and the suit-up is skipped.
- **Alt text:** "Farmer mascot" and "Farmer mascot in astronaut suit".
- **Static files:** `apps/web/public/assets/characters/farmer.svg` and `farmer-astronaut.svg` (transparent, about 9 KB and 11 KB). Regenerate them with `npx tsx apps/web/scripts/export-mascots.tsx`.
- **Using supplied raster art:** add a transparent PNG or WebP (under about 300 KB) to `apps/web/public/assets/characters/`, then set its path in `MASCOT_IMAGES` in `FarmerMascot.tsx`. Raster images get whole-body motion only (bob, hover, shake, bounce). Blinking and waving need the SVG.
- The mascot is a visual layer only. The login logic is unchanged; `markJustSignedIn()` just records that the welcome animation should play.

## "Fresh Pine" app theme (Explore, My Farm, My Plan, Community)

These sections use a refined palette. The rest of the site (home page, login, account, data sources) keeps the original palette.

**How it works:** `AppLayout` adds `class="fv-theme-app"` to `<html>` on the themed routes (`THEMED_SECTIONS`). The theme block in `styles/index.css` re-points the existing colour tokens, so components keep using the same classes (`bg-emerald-600`, `text-ink-muted` and so on). No component code has hard-coded colours. Because the class sits on `<html>`, dialogs and popovers rendered outside the page tree match too.

**Themed routes:**

- Explore: `/explore` and the farm details step `/setup`
- My Farm: `/farm` and its tools `/rotations`, `/roots`, `/climate`, `/gaps`
- My Plan: `/plan`
- Community: `/community/*`

**Design decisions:**

- **Canvas moved from warm parchment (#f5f3eb) to a cool mist (#f3f6f4).** White cards now separate cleanly from the page, and the pages feel lighter and more modern.
- **The forest + harvest-gold identity is kept,** because it links agriculture and space. The primary green is deepened to pine #0e7a57 for more confident buttons and active states.
- **Gold is the only accent,** used sparingly for secondary calls to action and demo labels. Its hover is darkened so white text passes AA (5.2:1; it was 3.2:1).
- **Chart colours and status colours are unchanged.** They are validated for colour-blind readers and are always paired with an icon and text.
- **Keyboard focus uses a pine ring,** which shows at 3:1 or better on both white and dark tiles; the global gold ring is too faint on white. Form fields get one consistent border, hover and focus treatment.

| Role                               | Token                           | Value                 | Contrast                                      |
| ---------------------------------- | ------------------------------- | --------------------- | --------------------------------------------- |
| Page background                    | `cream-100`                     | `#f3f6f4`             | —                                             |
| Surface (cards)                    | `white`                         | `#ffffff`             | —                                             |
| Secondary surface / inner tiles    | `cream-100` / `sage-100`        | `#f3f6f4` / `#e6f1ec` | —                                             |
| Divider / neutral badge            | `cream-200`                     | `#e4ebe7`             | —                                             |
| Primary text                       | `charcoal`                      | `#10201a`             | 15.5:1 on the page                            |
| Secondary text                     | `ink-muted`                     | `#4a5b53`             | 6.8:1 on the gradient, 6.4:1 on #DBDBDB boxes |
| Primary (buttons, active)          | `emerald-600`                   | `#0e7a57`             | 5.3:1 with white text                         |
| Primary hover / links              | `emerald-700`                   | `#0a6247`             | 7.4:1 on white                                |
| Primary tint (chips, success tint) | `emerald-100`                   | `#dff1e8`             | 6.3:1 with `emerald-700` text                 |
| Focus ring                         | `emerald-500`                   | `#17956b`             | ≥3:1 on white and on forest                   |
| Accent                             | `gold-500`                      | `#d4a24c`             | 6.6:1 with forest text                        |
| Accent hover                       | `gold-600`                      | `#8e651c`             | 5.2:1 with white text                         |
| Deep surface (banner, tool tiles)  | `forest-900`                    | `#0f2a22`             | 14.8:1 with cream text                        |
| Information tint                   | `sky-100`                       | `#e7f1fa`             | —                                             |
| Success / warning / error          | `good` / `warning` / `critical` | unchanged             | paired with icon + text                       |

### Gradient canvas, light boxes and see-through navbar

In these sections the page area between the header and the footer is a rounded canvas (28 px corners, 20 px on phones) with a subtle glow.

- **Gradient:** pure white (#FFFFFF) at the top-left, blending through soft mint into #E6FFE6 at the bottom-right. Two radial glows make the blend seamless.
- **Fixed while scrolling:** the gradient stays fixed to the screen, so long pages look the same everywhere.
- **Boxes:** white boxes (cards, panels) are #DBDBDB.
  - Form fields stay white so they are easy to type in.
  - Dark accent tiles stay dark.
- **Navbar:** #E6FFE6 at 72% opacity with a soft blur, so the page shows faintly through it while scrolling.
- **Contrast:** primary text is 15.1:1 on the boxes. Secondary text is 6.4:1 on the boxes and 6.8:1 on the gradient. Navbar links are 10.9:1.
- **Code:** the styles are at the end of `styles/index.css` (`html.fv-theme-app main#main` and `html.fv-theme-app header.sticky`).
