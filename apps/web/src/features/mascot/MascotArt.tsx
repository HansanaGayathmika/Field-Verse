/**
 * FieldVerse mascot artwork — hand-built SVG so each part (eyes, head, waving arm, body)
 * can be animated separately with CSS. No imports, so it can also be rendered to static
 * .svg files (see scripts/export-mascots.tsx).
 *
 * Coordinates use a 200 × 260 viewBox. Animation hooks are the m-* class names
 * (styles in mascot.css). Soft radial gradients give the rounded, "3D cartoon" look.
 */

export type MascotVariant = 'farmer' | 'astronaut';

const C = {
  skin: '#f2c294',
  skinShade: '#d99a6c',
  cheek: '#ec8f7f',
  beard: '#7a4a26',
  beardDark: '#5a3418',
  eye: '#2b1d14',
  straw: '#e8bd62',
  strawShade: '#b98a33',
  band: '#9b3b26',
  denim: '#2f6fb3',
  denimDark: '#1f4f86',
  stitch: '#f2c46b',
  shirt: '#c9563e',
  shirtDark: '#9e3d2b',
  boot: '#5b3a22',
  corn: '#f6c843',
  cornDark: '#d9a21e',
  husk: '#6aa84f',
  huskDark: '#3f7f3a',
  wicker: '#b5814a',
  wickerDark: '#8a5a2c',
  suit: '#f7f9fc',
  suitShade: '#c9d3df',
  orange: '#f08a3c',
};

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-skin`} cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#ffd9b3" />
        <stop offset="1" stopColor={C.skin} />
      </radialGradient>
      <radialGradient id={`${id}-straw`} cx="45%" cy="30%" r="75%">
        <stop offset="0" stopColor="#f8dc93" />
        <stop offset="1" stopColor={C.straw} />
      </radialGradient>
      <linearGradient id={`${id}-denim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4a8ad0" />
        <stop offset="1" stopColor={C.denimDark} />
      </linearGradient>
      <linearGradient id={`${id}-shirt`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e06a4f" />
        <stop offset="1" stopColor={C.shirtDark} />
      </linearGradient>
      <radialGradient id={`${id}-suit`} cx="38%" cy="30%" r="80%">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.7" stopColor={C.suit} />
        <stop offset="1" stopColor={C.suitShade} />
      </radialGradient>
      <radialGradient id={`${id}-glass`} cx="35%" cy="30%" r="75%">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
        <stop offset="0.65" stopColor="#d6eeff" stopOpacity="0.05" />
        <stop offset="1" stopColor="#9cc8ee" stopOpacity="0.28" />
      </radialGradient>
      <linearGradient id={`${id}-corn`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fbe07a" />
        <stop offset="1" stopColor={C.cornDark} />
      </linearGradient>
    </defs>
  );
}

/** A corn cob with husk leaves, centred on (0,0), pointing up. */
function Cob({ x, y, r = 0, s = 1, id }: { x: number; y: number; r?: number; s?: number; id: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M-3 14 C-12 6 -12 -6 -8 -14 C-6 -4 -4 4 -3 14 Z" fill={C.husk} />
      <ellipse cx="0" cy="-4" rx="6" ry="16" fill={`url(#${id}-corn)`} stroke={C.cornDark} strokeWidth="0.8" />
      {[-14, -9, -4, 1, 6].map((cy) => (
        <path key={cy} d={`M-5 ${cy} H5`} stroke={C.cornDark} strokeWidth="0.7" opacity="0.7" />
      ))}
      <path d="M0 -20 V10 M-3 -18 V8 M3 -18 V8" stroke={C.cornDark} strokeWidth="0.5" opacity="0.5" />
      <path d="M3 14 C12 6 12 -6 8 -14 C6 -4 4 4 3 14 Z" fill={C.huskDark} />
    </g>
  );
}

function StrawHat({ id, transform }: { id: string; transform?: string }) {
  return (
    <g transform={transform}>
      <ellipse cx="100" cy="50" rx="54" ry="13" fill={C.strawShade} />
      <ellipse cx="100" cy="48" rx="53" ry="12" fill={`url(#${id}-straw)`} />
      <path d="M72 49 C72 26 84 16 100 16 C116 16 128 26 128 49 Z" fill={`url(#${id}-straw)`} stroke={C.strawShade} strokeWidth="1" />
      <path d="M72.5 41 C85 45 115 45 127.5 41 L128 49 C115 53 85 53 72 49 Z" fill={C.band} />
      <g stroke={C.strawShade} strokeWidth="0.8" opacity="0.55" fill="none">
        <path d="M82 22 C86 30 87 36 86 40" />
        <path d="M100 17 V40" />
        <path d="M118 22 C114 30 113 36 114 40" />
        <path d="M58 46 C75 52 125 52 142 46" />
      </g>
    </g>
  );
}

/** Face and beard. Head group pivots at the neck (100,112) for look / shake. */
function Head({ id, hat }: { id: string; hat: boolean }) {
  return (
    <g className="m-head">
      <rect x="92" y="98" width="16" height="16" rx="6" fill={C.skinShade} />
      <ellipse cx="70" cy="80" rx="6" ry="8" fill={C.skinShade} />
      <ellipse cx="130" cy="80" rx="6" ry="8" fill={C.skinShade} />
      <ellipse cx="100" cy="78" rx="30" ry="33" fill={`url(#${id}-skin)`} />
      {/* beard */}
      <path d="M71 78 C71 100 82 122 100 124 C118 122 129 100 129 78 C126 92 118 98 100 98 C82 98 74 92 71 78 Z" fill={C.beard} />
      <path d="M84 112 C92 118 108 118 116 112" stroke={C.beardDark} strokeWidth="1.2" fill="none" opacity="0.6" />
      {/* cheeks */}
      <ellipse cx="80" cy="86" rx="6" ry="4" fill={C.cheek} opacity="0.55" />
      <ellipse cx="120" cy="86" rx="6" ry="4" fill={C.cheek} opacity="0.55" />
      {/* smile */}
      <path className="m-mouth" d="M90 98 C94 108 106 108 110 98 Z" fill="#7d2a20" />
      <path d="M94 103 C98 106 102 106 106 103 C104 101 96 101 94 103 Z" fill="#e8746a" />
      {/* moustache + nose */}
      <path d="M100 93 C93 89 84 92 82 97 C88 95 95 97 100 96 C105 97 112 95 118 97 C116 92 107 89 100 93 Z" fill={C.beardDark} />
      <ellipse cx="100" cy="86" rx="6" ry="5" fill={C.skinShade} />
      <ellipse cx="98" cy="84.5" rx="2" ry="1.4" fill="#ffd9b3" opacity="0.8" />
      {/* eyebrows */}
      <path className="m-brows" d="M80 62 C85 58 92 58 95 61 M105 61 C108 58 115 58 120 62" stroke={C.beardDark} strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* eyes — blink scales this group */}
      <g className="m-eyes">
        <ellipse cx="88" cy="72" rx="5.5" ry="6.5" fill="#fff" />
        <ellipse cx="112" cy="72" rx="5.5" ry="6.5" fill="#fff" />
        <g className="m-pupils">
          <circle cx="88.5" cy="73" r="3.4" fill={C.eye} />
          <circle cx="112.5" cy="73" r="3.4" fill={C.eye} />
          <circle cx="89.6" cy="71.6" r="1.1" fill="#fff" />
          <circle cx="113.6" cy="71.6" r="1.1" fill="#fff" />
        </g>
      </g>
      {hat ? <StrawHat id={id} /> : null}
    </g>
  );
}

function Basket({ id }: { id: string }) {
  return (
    <g>
      <Cob id={id} x={146} y={150} r={-18} s={0.85} />
      <Cob id={id} x={160} y={146} r={8} s={0.9} />
      <Cob id={id} x={172} y={152} r={26} s={0.8} />
      <path d="M130 158 H184 L177 198 C170 203 144 203 137 198 Z" fill={C.wicker} stroke={C.wickerDark} strokeWidth="1.5" />
      <g stroke={C.wickerDark} strokeWidth="1" opacity="0.7">
        <path d="M132 170 H182 M134 182 H180 M136 193 H178" />
        <path d="M144 158 L146 201 M157 158 V202 M170 158 L168 201" />
      </g>
      <rect x="128" y="155" width="58" height="7" rx="3.5" fill={C.wickerDark} />
    </g>
  );
}

function Farmer({ id }: { id: string }) {
  return (
    <>
      {/* legs + boots */}
      <path d="M74 176 H126 L124 232 H104 L101 198 H99 L96 232 H76 Z" fill={`url(#${id}-denim)`} />
      <ellipse cx="85" cy="236" rx="15" ry="7" fill={C.boot} />
      <ellipse cx="115" cy="236" rx="15" ry="7" fill={C.boot} />
      {/* shirt torso */}
      <path d="M64 124 C70 112 84 108 100 108 C116 108 130 112 136 124 L132 182 H68 Z" fill={`url(#${id}-shirt)`} />
      <g stroke={C.shirtDark} strokeWidth="1.2" opacity="0.45">
        <path d="M66 140 H134 M67 156 H133" />
        <path d="M80 112 V180 M120 112 V180" />
      </g>
      {/* overall bib + straps + buttons */}
      <path d="M80 132 H120 L124 182 H76 Z" fill={`url(#${id}-denim)`} />
      <rect x="90" y="142" width="20" height="14" rx="3" fill={C.denimDark} />
      <path d="M90 142 H110" stroke={C.stitch} strokeWidth="1" strokeDasharray="2 2" />
      <path d="M81 134 L72 112 M119 134 L128 112" stroke={`url(#${id}-denim)`} strokeWidth="9" strokeLinecap="round" />
      <circle cx="82" cy="134" r="3" fill={C.stitch} />
      <circle cx="118" cy="134" r="3" fill={C.stitch} />
      {/* resting arm + basket */}
      <path d="M130 120 C142 128 148 144 148 160" stroke={`url(#${id}-shirt)`} strokeWidth="15" strokeLinecap="round" fill="none" />
      <Basket id={id} />
      <circle cx="148" cy="162" r="7" fill={C.skin} />
      <Head id={id} hat />
      {/* waving arm with corn — pivots at the shoulder (66,122) */}
      <g className="m-wave">
        <path d="M68 122 C56 116 46 100 44 84" stroke={`url(#${id}-shirt)`} strokeWidth="15" strokeLinecap="round" fill="none" />
        <Cob id={id} x={42} y={62} r={-12} />
        <circle cx="44" cy="80" r="7.5" fill={C.skin} />
      </g>
    </>
  );
}

function Astronaut({ id }: { id: string }) {
  return (
    <>
      {/* backpack */}
      <rect x="58" y="110" width="84" height="80" rx="16" fill={C.suitShade} />
      <rect x="62" y="114" width="10" height="30" rx="4" fill={C.orange} />
      {/* legs + boots */}
      <path d="M72 176 H128 L126 230 H104 L101 200 H99 L96 230 H74 Z" fill={`url(#${id}-suit)`} stroke={C.suitShade} strokeWidth="1.5" />
      <rect x="77" y="204" width="17" height="8" rx="4" fill={C.orange} />
      <rect x="106" y="204" width="17" height="8" rx="4" fill={C.orange} />
      <ellipse cx="85" cy="236" rx="16" ry="7.5" fill="#8d99a6" />
      <ellipse cx="115" cy="236" rx="16" ry="7.5" fill="#8d99a6" />
      {/* suit torso */}
      <path d="M62 126 C68 114 84 110 100 110 C116 110 132 114 138 126 L134 184 H66 Z" fill={`url(#${id}-suit)`} stroke={C.suitShade} strokeWidth="1.5" />
      {/* denim overall panels and straps — echo his overalls */}
      <path d="M80 136 H120 L124 184 H76 Z" fill={`url(#${id}-denim)`} />
      <path d="M80 136 H120 M78 160 H122" stroke={C.stitch} strokeWidth="1" strokeDasharray="2 2" />
      <path d="M81 138 L72 116 M119 138 L128 116" stroke={`url(#${id}-denim)`} strokeWidth="9" strokeLinecap="round" />
      <circle cx="82" cy="138" r="3" fill={C.stitch} />
      <circle cx="118" cy="138" r="3" fill={C.stitch} />
      {/* corn-cob chest patch */}
      <circle cx="100" cy="164" r="11" fill="#14365e" stroke={C.stitch} strokeWidth="1.5" />
      <Cob id={id} x={100} y={166} s={0.42} r={20} />
      {/* resting arm + basket */}
      <path d="M132 122 C144 130 150 146 150 160" stroke={`url(#${id}-suit)`} strokeWidth="17" strokeLinecap="round" fill="none" />
      <path d="M144 140 L156 136" stroke={C.orange} strokeWidth="5" strokeLinecap="round" />
      <Basket id={id} />
      <circle cx="149" cy="163" r="8.5" fill="#e3e9f0" stroke={C.suitShade} />
      {/* head inside a clear helmet */}
      <ellipse cx="100" cy="116" rx="32" ry="8" fill="#9aa6b2" />
      <Head id={id} hat={false} />
      <circle cx="100" cy="76" r="45" fill={`url(#${id}-glass)`} stroke="#dfe6ee" strokeWidth="4" />
      <path d="M70 52 C78 40 90 35 102 35" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85" />
      <circle cx="66" cy="62" r="2.6" fill="#fff" opacity="0.85" />
      {/* his straw hat, resting on top of the helmet */}
      <StrawHat id={id} transform="rotate(-8 100 34) translate(102 35) scale(0.82) translate(-100 -48)" />
      {/* waving arm with corn — pivots at the shoulder */}
      <g className="m-wave">
        <path d="M66 124 C54 118 44 102 42 86" stroke={`url(#${id}-suit)`} strokeWidth="17" strokeLinecap="round" fill="none" />
        <path d="M46 104 L58 110" stroke={C.orange} strokeWidth="5" strokeLinecap="round" />
        <Cob id={id} x={40} y={62} r={-12} />
        <circle cx="42" cy="82" r="8.5" fill="#e3e9f0" stroke={C.suitShade} />
      </g>
    </>
  );
}

function Sparkles() {
  const star = 'M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7 Z';
  return (
    <g className="m-sparkles" fill="#fff4c2">
      {[
        [22, 30, 1],
        [178, 40, 0.8],
        [188, 120, 1.1],
        [14, 150, 0.7],
        [170, 210, 0.6],
      ].map(([x, y, s], i) => (
        <path key={i} className="m-spark" style={{ animationDelay: `${i * 0.55}s` }} d={star} transform={`translate(${x} ${y}) scale(${s})`} />
      ))}
    </g>
  );
}

export function MascotArt({ variant, idSuffix = '' }: { variant: MascotVariant; idSuffix?: string }) {
  const id = `fvm-${variant}${idSuffix}`;
  return (
    <>
      <Defs id={id} />
      {variant === 'astronaut' ? <Sparkles /> : null}
      <ellipse className="m-shadow" cx="100" cy="246" rx="52" ry="7" fill="#000" opacity="0.14" />
      <g className="m-body">{variant === 'farmer' ? <Farmer id={id} /> : <Astronaut id={id} />}</g>
    </>
  );
}

export const MASCOT_VIEWBOX = '0 0 200 260';
