/**
 * Writes the mascot SVGs to public/assets/characters/ as static, transparent files
 * (for the README, social cards or anywhere outside the React app).
 * Run from the repo root: npx tsx apps/web/scripts/export-mascots.tsx
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// tsx compiles JSX in classic mode here, so the art module needs a global React.
(globalThis as unknown as { React: typeof React }).React = React;
const { MascotArt, MASCOT_VIEWBOX } = await import('../src/features/mascot/MascotArt');

const files = [
  ['farmer', 'farmer.svg', 'Farmer mascot'],
  ['astronaut', 'farmer-astronaut.svg', 'Farmer mascot in astronaut suit'],
] as const;
for (const [variant, file, title] of files) {
  const inner = renderToStaticMarkup(React.createElement(MascotArt, { variant }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MASCOT_VIEWBOX}" width="400" height="520" role="img" aria-label="${title}"><title>${title}</title>${inner}</svg>\n`;
  writeFileSync(fileURLToPath(new URL(`../public/assets/characters/${file}`, import.meta.url)), svg);
  console.log(file, (svg.length / 1024).toFixed(1), 'KB');
}
