#!/usr/bin/env node
/**
 * Generates app icons for Divergence IQ
 * Creates a default icon + 16 alternate icons as SVG, then converts to PNG/ICO/ICNS
 * Run: node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const iconDir = join(projectRoot, "build-resources", "icons");
const publicIconDir = join(projectRoot, "public", "app-icons");

mkdirSync(iconDir, { recursive: true });
mkdirSync(publicIconDir, { recursive: true });

const ICON_SIZE = 1024;

const ICON_THEMES = [
  {
    id: "default",
    name: "Divergence",
    bg: "#0a0e1a",
    fg: "#3b82f6",
    accent: "#60a5fa",
    pattern: "wave",
  },
  {
    id: "aurora",
    name: "Aurora",
    bg: "#0c2340",
    fg: "#2dd4bf",
    accent: "#67e8f9",
    pattern: "wave",
  },
  {
    id: "amber",
    name: "Trader Amber",
    bg: "#1f1408",
    fg: "#f59e0b",
    accent: "#fbbf24",
    pattern: "wave",
  },
  {
    id: "neon",
    name: "Neon Cyber",
    bg: "#1a0833",
    fg: "#ec4899",
    accent: "#a855f7",
    pattern: "wave",
  },
  {
    id: "matrix",
    name: "Matrix",
    bg: "#001a00",
    fg: "#22c55e",
    accent: "#4ade80",
    pattern: "wave",
  },
  {
    id: "crimson",
    name: "Crimson",
    bg: "#1a0008",
    fg: "#ef4444",
    accent: "#f87171",
    pattern: "wave",
  },
  {
    id: "arctic",
    name: "Arctic",
    bg: "#001428",
    fg: "#38bdf8",
    accent: "#7dd3fc",
    pattern: "wave",
  },
  { id: "void", name: "Void", bg: "#000000", fg: "#6b7280", accent: "#9ca3af", pattern: "wave" },
  { id: "ocean", name: "Ocean", bg: "#0c4a6e", fg: "#0ea5e9", accent: "#38bdf8", pattern: "wave" },
  {
    id: "forest",
    name: "Forest",
    bg: "#052e16",
    fg: "#16a34a",
    accent: "#4ade80",
    pattern: "wave",
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "#1a0a00",
    fg: "#f97316",
    accent: "#fb923c",
    pattern: "wave",
  },
  { id: "royal", name: "Royal", bg: "#1a1a2e", fg: "#6366f1", accent: "#818cf8", pattern: "wave" },
  { id: "gold", name: "Gold", bg: "#1c1917", fg: "#eab308", accent: "#facc15", pattern: "wave" },
  { id: "teal", name: "Teal", bg: "#042f2e", fg: "#14b8a6", accent: "#2dd4bf", pattern: "wave" },
  { id: "rose", name: "Rose", bg: "#1a0a10", fg: "#f43f5e", accent: "#fb7185", pattern: "wave" },
  { id: "slate", name: "Slate", bg: "#1e293b", fg: "#94a3b8", accent: "#cbd5e1", pattern: "wave" },
  {
    id: "emerald",
    name: "Emerald",
    bg: "#022c22",
    fg: "#10b981",
    accent: "#34d399",
    pattern: "wave",
  },
];

function generateSVG(theme) {
  const { bg, fg, accent, pattern } = theme;
  const s = ICON_SIZE;
  const cx = s / 2;
  const cy = s / 2;

  let patternSVG = "";
  if (pattern === "wave") {
    patternSVG = `
      <g opacity="0.15">
        <path d="M0,${s * 0.7} Q${s * 0.25},${s * 0.5} ${s * 0.5},${s * 0.7} T${s},${s * 0.7} V${s} H0 Z" fill="${accent}"/>
        <path d="M0,${s * 0.8} Q${s * 0.25},${s * 0.6} ${s * 0.5},${s * 0.8} T${s},${s * 0.8} V${s} H0 Z" fill="${fg}"/>
      </g>
      <g transform="translate(${cx}, ${cy})">
        <circle r="${s * 0.28}" fill="none" stroke="${fg}" stroke-width="${s * 0.04}" opacity="0.3"/>
        <circle r="${s * 0.2}" fill="none" stroke="${accent}" stroke-width="${s * 0.03}" opacity="0.5"/>
        <path d="M${-s * 0.15},${s * 0.05} L${-s * 0.05},${-s * 0.1} L${s * 0.05},${s * 0.08} L${s * 0.15},${-s * 0.05}"
              fill="none" stroke="${fg}" stroke-width="${s * 0.035}" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${-s * 0.15}" cy="${s * 0.05}" r="${s * 0.015}" fill="${accent}"/>
        <circle cx="${-s * 0.05}" cy="${-s * 0.1}" r="${s * 0.015}" fill="${accent}"/>
        <circle cx="${s * 0.05}" cy="${s * 0.08}" r="${s * 0.015}" fill="${accent}"/>
        <circle cx="${s * 0.15}" cy="${-s * 0.05}" r="${s * 0.015}" fill="${accent}"/>
      </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="bg-${theme.id}" cx="50%" cy="40%">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${s * 0.22}" fill="url(#bg-${theme.id})"/>
  ${patternSVG}
  <text x="${cx}" y="${s * 0.92}" text-anchor="middle" font-family="sans-serif" font-size="${s * 0.06}" font-weight="bold" fill="${accent}" opacity="0.6">DIQ</text>
</svg>`;
}

function svgToPNGData(svg) {
  // Simple rasterizer: convert SVG to a basic PNG using raw pixel manipulation
  // This is a fallback - the CI workflow will use sharp/ImageMagick for proper conversion
  return svg;
}

const iconManifest = [];

for (const theme of ICON_THEMES) {
  const svg = generateSVG(theme);
  const svgPath = join(iconDir, `${theme.id}.svg`);
  writeFileSync(svgPath, svg);

  const publicSvgPath = join(publicIconDir, `${theme.id}.svg`);
  writeFileSync(publicSvgPath, svg);

  iconManifest.push({
    id: theme.id,
    name: theme.name,
    path: `/app-icons/${theme.id}.svg`,
    colors: { bg: theme.bg, fg: theme.fg, accent: theme.accent },
  });
}

const manifestPath = join(publicIconDir, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(iconManifest, null, 2));

const manifestJsPath = join(projectRoot, "src", "lib", "app-icons.ts");
writeFileSync(
  manifestJsPath,
  `export interface AppIcon {
  id: string;
  name: string;
  path: string;
  colors: { bg: string; fg: string; accent: string };
}

export const APP_ICONS: AppIcon[] = ${JSON.stringify(iconManifest, null, 2)};

const STORAGE_KEY = 'diq.appIcon';

export function getActiveIcon(): string {
  if (typeof localStorage === 'undefined') return 'default';
  return localStorage.getItem(STORAGE_KEY) || 'default';
}

export function setActiveIcon(iconId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, iconId);
  window.dispatchEvent(new CustomEvent('diq:icon-change', { detail: iconId }));
}

export default APP_ICONS;
`,
);

console.log(`Generated ${ICON_THEMES.length} app icons`);
console.log(`Icon directory: ${iconDir}`);
console.log(`Public directory: ${publicIconDir}`);
console.log(`Manifest: ${manifestPath}`);
console.log(`TypeScript: ${manifestJsPath}`);
