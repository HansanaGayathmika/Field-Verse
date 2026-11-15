# FieldVerse Community — "Learn from farmers near you"

**Audience:** developers, moderators and reviewers of the FieldVerse project.

A location-based, anonymous place where farmers share real experiences and learn from farmers nearby.

- **No AI or ML is used.** Ranking is a transparent, deterministic rule.
- **Community content is kept separate from the analysis.** It never changes Rotation Lab results.

## User flows

| Route | Who | What |
|---|---|---|
| `/community` | Everyone | The "Farmers Helping Farmers" feed, centred on the farmer's area. Has a location banner, filters, search, sorting, a privacy notice and an empty state. |
| `/community/share` | Everyone can fill it in; **publishing needs an account** | A guided form, then a preview of exactly what will be public, then a privacy check, then publish. Guests keep a temporary draft in this browser tab. |
| `/community/experiences/:id` | Everyone | Full experience, helpful button, report button, and related experiences with the reason each is shown. |
| `/community/my-experiences` | Signed in | The farmer's own posts with review status, helpful count, public location, edit and delete. |
| `/community/moderation` | Moderators and admins (checked by the server) | The review queue: publish, keep hidden or remove. |

**Rotation Lab:** a "What other farmers say" box links to `/community?crop=<id>&scope=country`. It is labelled *"Community experiences — not verified crop recommendations."*

## Location model (privacy first)

1. The farm's location (from Explore and the farm form) is sent to **our** server, `GET /community/locations/resolve`.
2. The server rounds it to about 1 km and asks OpenStreetMap Nominatim for the administrative area. It returns only:
   - `countryCode` / `countryName` — ISO 3166-1
   - `admin1Code` / `admin1Name` — ISO 3166-2 level 4, e.g. `LK-7` North Central Province, `KE-31` Nakuru, `BR-MT` Mato Grosso
   - `admin2Code` / `admin2Name` — ISO 3166-2 level 5 where it exists, e.g. `LK-71` Anuradhapura District. Otherwise a deterministic derived code `<admin1Code>:<slug>`, e.g. `KE-31:njoro`.
3. The response includes an **HMAC area token**. A post must present the token, so a client cannot invent or misspell an area.
4. When sharing, the farmer chooses how much to publish:
   - district, e.g. "Anuradhapura District, North Central Province, Sri Lanka"
   - province, e.g. "North Central Province, Sri Lanka"
   - country only, e.g. "Sri Lanka"

   **Only that level is stored.** Finer parts are dropped, and coordinates are never stored.
5. Level names follow the country:

   | Country | admin1 | admin2 |
   |---|---|---|
   | Sri Lanka | Province | District |
   | Kenya | County | Sub-county |
   | Brazil | State | Municipality |
   | Others | Region | District |

   Areas without a district fall back to the province, then the country.

## Ranking (deterministic)

The feed computes a relevance level for every published post, relative to the viewer's area:

| Level | Meaning | Reason shown on the card |
|---|---|---|
| 1 | Same district (`admin2Code`) | "Shared in Anuradhapura District" |
| 2 | Same province or state (`admin1Code`) | "Elsewhere in North Central Province" |
| 3 | Same country | "Elsewhere in Sri Lanka" |
| 4 | Another country | "From Kenya" |

The **scope** controls which levels are included:

| Scope | Levels included |
|---|---|
| `admin2` | 1 |
| `admin1` | 1–2 |
| `country` | 1–3 |
| `world` | 1–4 |
| `auto` (default) | 1–3, **plus level 4 only if fewer than 5 experiences exist in the viewer's country**. The page says so. |

**Sorting:**

- **Most relevant location:** level, then crop match (`preferCrop`), then text-search score, then newest.
- **Most recent:** newest first.
- **Most helpful:** helpful count, then newest.

Older posts are never hidden.

Filtering and search happen in MongoDB: a crop filter, a topic (category) filter, a `$text` search on title, description and lessons, and pagination (10 per page, "Show more"). The browser never downloads the whole collection.

## Data model (MongoDB)

**`communityExperiences`** (private shape):

- `ownerId`
- `publicLocation {countryCode, countryName, admin1Code, admin1Name, admin2Code, admin2Name, visibilityLevel}`
- `cropId`, `category`, `title`, `description`, `lessonsLearned`
- `season`, `approximateYear`, `irrigationMethod`, `soilNotes`, `weatherNotes`
- `moderationStatus` (`pending`, `published`, `hidden` or `removed`), `moderationMessage`, `moderatedBy`, `moderatedAt`
- `helpfulCount`, `openReportCount`, `edited`, `isDemo`, timestamps

Indexes: status combined with country, admin1, admin2 and date; status with crop; status with category; status with helpful count; owner; and a weighted text index.

**`communityReactions`:** `{experienceId, userId, type: 'helpful'}`, with a **unique** compound index. This gives one helpful per account per post.

**`communityReports`:** `{experienceId, reporterId, reason, details, status}`, with a unique `(experienceId, reporterId)` index.

Clients never receive these documents. The public DTO is built field by field in `services/community.ts`, as `toPublicExperience` and `toMyExperience`.

## API (`/api/v1/community`)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/experiences` | Public | Feed. Query: `countryCode`, `admin1Code`, `admin2Code`, `scope`, `cropId`, `category`, `preferCrop`, `q`, `sort`, `page`, `pageSize` |
| GET | `/experiences/:id` | Public | Published posts only. Anything else returns 404. |
| GET | `/experiences/:id/related` | Public | Up to 4 posts, each with a reason |
| GET | `/locations` | Public | Areas that have published experiences, with counts |
| GET | `/locations/resolve?lat&lon` | Public | Coarse area plus area token. Coordinates are not stored. |
| GET | `/categories` | Public | Topics with labels and counts |
| POST | `/experiences` | Signed in | Strict schema with the area token. Starts as `pending`. |
| GET | `/my-experiences` | Signed in | The caller's posts only |
| PATCH | `/experiences/:id` | Owner | An edit sends the post back to `pending`. The area can only get broader unless it is re-resolved. |
| DELETE | `/experiences/:id` | Owner | Also deletes its reactions and reports |
| POST / DELETE | `/experiences/:id/helpful` | Signed in, not the owner | Idempotent. Returns the server-side count. |
| POST | `/experiences/:id/report` | Signed in, not the owner | One per account. **3 distinct open reports** hide the post. |
| GET | `/moderation/queue` | Moderator | Pending, hidden and reported posts, without author or reporter identity |
| PATCH | `/moderation/:id` | Moderator, not their own post | Sets `published`, `hidden` or `removed`, and resolves open reports |

Errors use the standard envelope. A `PRIVACY_CHECK_REQUIRED` error (422) does not echo the detected text.

## Moderation policy (initial version)

- **Premoderation is on** (`COMMUNITY_PREMODERATION=true`). New and edited posts are `pending` until a moderator publishes them.
- **Reports:** three different accounts reporting a published post hides it until review (`COMMUNITY_AUTO_HIDE_REPORTS`).
- **Moderators** are made with `npm run make-moderator -w @fieldverse/api -- someone@example.org`. The role is read from the database on every request.
- Moderators cannot moderate their own posts. Authors cannot report or mark their own posts as helpful.
- The automatic personal-information check (emails, phone numbers, links, coordinates, social handles, street addresses) is a **helper only**. The UI says it is not perfect.

## Scientific honesty

- Every card and detail page says "Farmer-reported — not independently verified" and "Conditions may differ on your farm."
- Community content never feeds the Rotation Lab, the scenario engine or ML training.
- Helpful counts are not verification. There are no "verified" badges, reputation scores or followers.
- **No fake activity:** no demo posts are created. The `isDemo` flag exists so any future demonstration fixtures must be visibly labelled. None exist today.

## Known limitations

- **Photo upload is not implemented.** Safe re-encoding and EXIF/GPS stripping need an image-processing library (such as `sharp`) that could not be reliably installed here. The UI states that photos are not supported yet.
- **Area resolution needs OpenStreetMap Nominatim** (1 request per second, cached). If it fails, farmers can pick from areas with experiences.
- **District names depend on OSM data quality.** Some places have no district; they fall back to province.
- **The area-token secret is random per server start** unless `COMMUNITY_AREA_SECRET` is set. Set it in production.
- **There is no notification** when a post is approved. Farmers see the status in My experiences.
- **Guest drafts live only in the current browser tab** (`sessionStorage`).

## Tests (executed 2026-11-14)

- `apps/api/test/community.test.ts`: **19 tests, all passing**. They cover:
  - location resolution: ISO codes, derived codes, fallback
  - ranking order across all four levels
  - auto scope, unknown-district fallback, filters, search, pagination
  - privacy: no owner id, email, name or coordinates in any public response; only the chosen level stored; forged areas rejected; personal-information confirmation; no leaks in errors
  - posting: guest blocked, validation, strict-schema mass-assignment rejection, pending status, edit and delete ownership
  - moderation permissions
  - helpful: one per account, undo, owner blocked
  - reports: duplicate blocked, three reports hide a post, review restores it
  - account deletion cleanup
- `tests/e2e/community.spec.ts`: **3 Playwright tests, all passing**. They cover guest browsing, the full share → moderate → discover → helpful → report → detail → Rotation Lab link → edit → delete journey, and the 360 px phone layout.
