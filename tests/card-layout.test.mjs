// Automated layout test for the result card.
// Mirrors the canvas drawing constants from src/routes/index.tsx
// and asserts that the name + category are vertically centered
// between the portraits and the similarity bar across various
// persona name lengths (and both LTR/RTL).

import { createCanvas } from "canvas";
import assert from "node:assert/strict";

const W = 1080;
const H = 1350;

// Constants mirrored from DownloadCardButton in src/routes/index.tsx
const PORTRAIT_Y = 170;
const PORTRAIT_SIZE = 380;
const PORTRAIT_LABEL_OFFSET = 50; // label baseline = portraitY + size + 50
const PORTRAIT_BLOCK_BOTTOM = PORTRAIT_Y + PORTRAIT_SIZE + PORTRAIT_LABEL_OFFSET; // 600
const NAME_Y = 735;
const NAME_FONT = "bold 48px serif";
const CATEGORY_Y = 778;
const CATEGORY_FONT = "italic 32px serif";
const BAR_Y = 820;

// Acceptable centering tolerance (px)
const TOL = 30;

const cases = [
  { lang: "en", name: "Tut",                           category: "Pharaoh" },
  { lang: "en", name: "Cleopatra",                     category: "Pharaoh" },
  { lang: "en", name: "Hatshepsut the Great",          category: "Pharaoh" },
  { lang: "en", name: "Amenhotep III, Lord of Truth",  category: "Pharaoh - Royalty" },
  { lang: "ar", name: "رمسيس",                         category: "فرعون" },
  { lang: "ar", name: "كليوباترا السابعة ملكة مصر",   category: "فرعون - ملكية" },
];

function measureBlockBounds(ctx, name, category) {
  ctx.font = NAME_FONT;
  const nm = ctx.measureText(name);
  const nameTop = NAME_Y - (nm.actualBoundingBoxAscent ?? 36);
  const nameBottom = NAME_Y + (nm.actualBoundingBoxDescent ?? 8);

  ctx.font = CATEGORY_FONT;
  const cm = ctx.measureText(category);
  const catTop = CATEGORY_Y - (cm.actualBoundingBoxAscent ?? 24);
  const catBottom = CATEGORY_Y + (cm.actualBoundingBoxDescent ?? 6);

  return {
    nameWidth: nm.width,
    catWidth: cm.width,
    blockTop: Math.min(nameTop, catTop),
    blockBottom: Math.max(nameBottom, catBottom),
  };
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

let failed = 0;
const results = [];

for (const c of cases) {
  const { nameWidth, catWidth, blockTop, blockBottom } = measureBlockBounds(
    ctx,
    c.name,
    c.category,
  );

  const available = { top: PORTRAIT_BLOCK_BOTTOM, bottom: BAR_Y }; // 600..820
  const availableMid = (available.top + available.bottom) / 2; // 710
  const blockMid = (blockTop + blockBottom) / 2;
  const offset = blockMid - availableMid;

  const fitsHorizontally = nameWidth <= W - 200 && catWidth <= W - 200;
  const fitsVerticallyTop = blockTop >= available.top - 5;
  const fitsVerticallyBot = blockBottom <= available.bottom - 5;
  const centered = Math.abs(offset) <= TOL;

  const pass = fitsHorizontally && fitsVerticallyTop && fitsVerticallyBot && centered;
  if (!pass) failed++;

  results.push({
    case: `[${c.lang}] ${c.name}`,
    nameW: Math.round(nameWidth),
    catW: Math.round(catWidth),
    blockTop: Math.round(blockTop),
    blockBottom: Math.round(blockBottom),
    centerOffset: Math.round(offset),
    fitsH: fitsHorizontally,
    fitsV: fitsVerticallyTop && fitsVerticallyBot,
    centered,
    pass,
  });
}

console.table(results);

assert.equal(
  failed,
  0,
  `${failed} card layout case(s) failed centering/fit assertions (tol=${TOL}px, available=600..820, mid=710).`,
);

console.log("✓ All card layout cases pass (name & category centered between portraits and bar).");
