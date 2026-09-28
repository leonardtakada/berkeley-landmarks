// The launch screen, printed as one full sheet: the cover's blue board with
// the same ink-laydown texture the cover lays over it (InkPlane at 0.18), and
// the Campanile device cut out on top — so there's no square of differently
// textured blue around the logo, and the launch screen gives way to the cover
// without a seam.
//
//   node scripts/splash.mjs
//     → assets/images/splash-full.png (the source, 1290 × 2796)
//     → ios/BerkeleyLandmarks/Images.xcassets/SplashScreenLogo.imageset (@1x/@2x/@3x)
import fs from "node:fs";
import sharp from "sharp";

const BOARD = { r: 0x0a, g: 0x2c, b: 0x8d }; // PAPER.board
const TEXTURE = 0.18; // the cover's InkPlane texture strength
const PT = { w: 430, h: 932 }; // the largest iPhone, in points; aspect-filled on the rest
const SCALE = 3;
const LOGO_PT = 240; // about the cover's logo width, so the two agree
const LOGO_RISE_PT = 58; // the cover sets its logo a little above centre

const W = PT.w * SCALE;
const H = PT.h * SCALE;

// The laydown tile (256 pt) at the cover's strength.
const tile = await sharp("assets/textures/ink-laydown@3x.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 3; i < tile.data.length; i += 4) tile.data[i] = Math.round(tile.data[i] * TEXTURE);
const tilePng = await sharp(tile.data, { raw: tile.info }).png().toBuffer();

const logo = await sharp("assets/images/logo-on-blue.png").resize({ width: LOGO_PT * SCALE }).png().toBuffer();
const { height: logoH } = await sharp(logo).metadata();

const sheet = await sharp({ create: { width: W, height: H, channels: 4, background: { ...BOARD, alpha: 1 } } })
  .composite([
    { input: tilePng, tile: true, top: 0, left: 0 },
    {
      input: logo,
      left: Math.round((W - LOGO_PT * SCALE) / 2),
      top: Math.round(H / 2 - LOGO_RISE_PT * SCALE - logoH / 2),
    },
  ])
  .flatten({ background: BOARD })
  .png()
  .toBuffer();

fs.writeFileSync("assets/images/splash-full.png", sheet);

const set = "ios/BerkeleyLandmarks/Images.xcassets/SplashScreenLogo.imageset";
for (const [s, name] of [
  [1, "image.png"],
  [2, "image@2x.png"],
  [3, "image@3x.png"],
]) {
  await sharp(sheet).resize(PT.w * s, PT.h * s).png().toFile(`${set}/${name}`);
}
console.log(`wrote assets/images/splash-full.png and ${set} (${PT.w}×${PT.h} pt)`);
