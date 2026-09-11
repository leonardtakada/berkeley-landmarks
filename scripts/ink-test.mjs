import sharp from "sharp";

const z=15, x=5252, y=12653; // downtown Berkeley
const res = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`);
const buf = Buffer.from(await res.arrayBuffer());
const { data: raw } = await sharp(buf).ensureAlpha(1).toColourspace("srgb").resize(256,256,{fit:"fill"}).raw().toBuffer({resolveWithObject:true});

const W=256;
const lum = new Float32Array(W*W);
for (let i=0;i<W*W;i++) lum[i] = 0.299*raw[i*4] + 0.587*raw[i*4+1] + 0.114*raw[i*4+2];

// contrast-stretch luminance
let mn=255, mx=0;
for (const v of lum){ if(v<mn)mn=v; if(v>mx)mx=v; }
for (let i=0;i<lum.length;i++) lum[i] = ((lum[i]-mn)/(mx-mn))*255;

const edge = new Float32Array(W*W);
let emax=0;
for (let y=1;y<W-1;y++) for (let x=1;x<W-1;x++){
  const i=y*W+x;
  const v = 4*lum[i]-lum[i-1]-lum[i+1]-lum[i-W]-lum[i+W];
  edge[i]=Math.max(0,v);
  if(edge[i]>emax)emax=edge[i];
}
console.log("edge max:", emax.toFixed(1));

for (const gain of [0.35, 0.7, 1.2]) {
  const ink = Buffer.alloc(W*W*4);
  for (let i=0;i<W*W;i++){
    const a = edge[i]>6 ? Math.min(230,(edge[i]-6)*gain*3) : 0;
    ink[i*4]=64; ink[i*4+1]=50; ink[i*4+2]=34; ink[i*4+3]=a;
  }
  const inkPng = await sharp(ink,{raw:{width:W,height:W,channels:4}}).png().toBuffer();
  await sharp(buf).resize(256,256).composite([{input:inkPng,blend:"over"}]).jpeg({quality:88})
    .toFile(process.env.HOME+`/.openclaw/workspace/tmp/ink_${gain}.jpg`);
}
console.log("done");
