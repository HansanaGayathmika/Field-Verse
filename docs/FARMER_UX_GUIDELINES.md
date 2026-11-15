# Farmer UX guidelines

**Audience:** everyone who writes screens or text for FieldVerse.

Farmers are the primary users. Extension officers and judges come second.

1. **Answer a farmer's question first.** Every chart starts with a question, such as "When does the rain come?", and ends with a takeaway computed from the data.
2. **Plain words.** Say "rain per year", not "annual precipitation". Put technical terms in "Technical note" or "Scientific evidence" sections that open on demand.
3. **Say where every number comes from.** Use provenance badges everywhere. Demo content always reads "Illustrative demo".
4. **Never hide options.** Priorities *order* strategies; they never filter them out.
5. **The farmer can disagree.** Corrections are visible. The system says exactly what it did with each one: a rule, a model, or not assessed.
6. **Show gaps honestly.** Missing data shows "Not available". It is never replaced by a guess.
7. **Always point to local verification.** Show "What should you check locally?" and questions to ask an extension officer.
8. **"I don't know" is a valid answer** in every form. It is sent as `unknown`, never guessed.
9. **One simple account step.** Visitors can view the home page freely. Using the tools needs a free account (name, email, password), and nothing else is asked.
10. **Phones first.** The layout works from 360 px wide with large touch targets. Low-bandwidth mode hides video and map tiles. Location permission is never required.
11. **Accessibility.**
    - Keyboard navigation, a skip link, visible gold focus rings, and labelled controls.
    - Colour always comes with text or an icon. Charts have data tables.
    - Reduced motion is respected.
    - Form errors are announced with `role="alert"`.
12. **Printing.** The decision card prints on one or two pages with labels and sources included.

## Writing checklist

- Is the sentence under 20 words?
- Would a farmer with primary-school reading level understand it?
- Does it avoid promising outcomes ("will increase yield") and use "may" or "could" instead?
- Is the source visible next to it?
