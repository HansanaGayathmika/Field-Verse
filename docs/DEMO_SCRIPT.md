# Demo script (about 5 minutes)

**Audience:** the team member presenting FieldVerse to NASA Space Apps judges.

**Setup:** start the app with `npm run dev`, open http://localhost:5173 in a desktop browser, and keep a 360 px phone emulator open in a second tab.

| Time | Screen | Say / do |
|---|---|---|
| 0:00 | **Landing** | "The globe behind me is real NASA satellite data: every month of 2024, how green Earth's land was." Point to the three futures cycling in the illustration. Show that the cards are display-only for visitors. Click **Sign up**, create an account, land back on the home page with the full menu, then click **Try Demo**. |
| 0:40 | **Explorer** | Tap **Sri Lanka** on the map. "Every number here is NASA POWER: about 1,360 mm of rain a year." Play the **regional satellite timelapse** and step through the months. Point out the data-status badges: Observed, Estimated, Illustrative demo. **Continue with demo farm.** |
| 1:20 | **Wizard** | The farm is pre-filled. Show the crop picture cards, the "I don't know" options and the priorities. **See my farm.** |
| 1:50 | **Dashboard** | Show the rainfall chart and its takeaway, which is computed from the data ("most rain in Oct–Dec"). Show the year-to-year chart: "Rain ranged from about 1,080 to 2,060 mm, so plans must work in both." Show the soil layers: "an estimate, not a soil test — we say so." |
| 2:30 | **Rotation Lab** | Show the three options side by side, with crop timelines and comparison bars. Point to the **Illustrative demo** banner: "Until the AI/ML model is connected, results are prepared examples and say so." |
| 3:00 | **Right to Disagree** | Add **"I do not have irrigation"**. Yala rice is flagged, quoting about 64 mm a month of observed rain. "This is a documented rule, and the app says so, not 'AI'." |
| 3:30 | **Climate Time Machine** | Choose **Hotter and drier**. Show the before/after skies and the "Worse" badges. Then move the rain slider to −10 %: "The demo doesn't have this combination, so we *refuse to invent* it." |
| 4:00 | **Roots of Tomorrow** | Play through the seasons. Rain follows real monthly rainfall, and the soil layers are SoilGrids estimates. Tap a layer. Switch the region to **Kenya**, then **Brazil**: "SoilGrids has no values at the Brazil point, so we show a gap instead of fake numbers." |
| 4:30 | **Explanation, then Decision card** | Open **Why? Full explanation**: benefits, risks, missing information, local checks, scientific evidence. Then **My Plan**, then **Print**. |
| 4:50 | **Architecture** | "One environment variable, `ANALYSIS_PROVIDER=remote`, switches to the AI/ML team's FastAPI service. Every response is checked against a shared contract; `npm run verify:ml` tests compatibility." |

**Backup:**

- If the network is slow, turn on **Low-bandwidth mode** in Settings. Videos become posters and the map hides.
- If the API is down, the UI shows a friendly error with a retry button.
