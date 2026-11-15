# Community privacy

**Audience:** the team, reviewers and anyone checking how FieldVerse protects farmers who share experiences.

The rule: **other people can see what happened and roughly where — never who, and never exactly where.**

## What other people can see

- The general location the farmer chose: district, province or country.
- The crop or topic.
- The farmer's own text (description, lessons, optional season, year and notes).
- The posting **date only**, never the time.
- The helpful count. Nobody can see who marked a post helpful.
- The status label "Farmer-reported — not independently verified".

## What is never shown

Real name, email, phone, username, account id, owner id, reporter id, moderator id, profile link, farm name, farm coordinates, home address, and the exact time of posting.

## How this is enforced (server-side, not by hiding things in the browser)

1. **Explicit public DTOs.** `toPublicExperience` copies an allow-list of fields, and the response schema is `.strict()`. Mongoose documents are never returned.
2. **No coordinates in the community collections.** The farm's location is converted on the server into an administrative area. Coordinates are rounded to about 1 km before being sent to OpenStreetMap, and are never stored or returned.
3. **Only the chosen location level is stored.** If a farmer shares at province level, the district is not saved at all. An existing post can only be made broader, unless the location is resolved again.
4. **Signed areas.** Posts must carry an HMAC token issued when the server resolved the area. This prevents made-up places and mislabelled areas.
5. **Ownership checks are inside the query** (`_id` plus `ownerId`). Someone else's post looks exactly like a missing one (404), so ownership is never revealed.
6. **Moderation tools are anonymous too.** The queue shows report reasons, but not who reported or who wrote the post.
7. **Error messages never echo private data.** For example, the personal-information warning lists only the *type* of detail found.
8. **No identity in logs.** Request logs record method, path, status and duration only.
9. **Account deletion removes everything:** the person's posts, the reactions and reports on them, and the person's own reactions (helpful counts are corrected) and reports.

## What the farmer is told before publishing

- "Your name and account details will not appear. Other farmers can see your selected general location and the experience you share."
- People could still recognise them from what they write. They should not include names, phone numbers, exact addresses or identifying details.
- An automatic check looks for obvious personal details (emails, phone numbers, links, coordinates, social handles, street addresses). It is **not perfect**, and the farmer must confirm before publishing if anything is found.
- Choosing a broader area is recommended where there are few farmers.
- Photos are not supported yet. When they are, faces, buildings and signs may reveal identity, and photos will be re-encoded to remove EXIF and GPS data.

## Tests that guard these rules

`apps/api/test/community.test.ts`, under *privacy (enforced server-side)*, checks that:

- public responses (feed, detail, related, locations) contain no owner id, email, name, `ownerId`, `passwordHash`, `reporterId`, `moderatedBy` or coordinates;
- only the chosen location level is stored;
- forged areas are rejected;
- a personal-information confirmation is required, without the private text being echoed;
- pending and other people's posts return 404 without identity.

The Playwright journey also checks that cards and moderation views never show the author's name or email.
