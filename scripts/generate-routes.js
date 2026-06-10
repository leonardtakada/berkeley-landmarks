#!/usr/bin/env node
/**
 * Generate road-following route coordinates for all tours using OSRM (free, no API key).
 * Usage: node scripts/generate-routes.js
 */
const fs = require('fs');
const path = require('path');

// Inline landmark data extraction (just need id -> lat/lng)
const landmarksSrc = fs.readFileSync(path.join(__dirname, '../data/landmarks.ts'), 'utf8');
const coordMap = {};
const re = /id:\s*'([^']+)'[^}]*latitude:\s*([\d.-]+)[^}]*longitude:\s*([-\d.]+)/g;
let m;
while ((m = re.exec(landmarksSrc)) !== null) {
  coordMap[m[1]] = { lat: parseFloat(m[2]), lng: parseFloat(m[3]) };
}
console.log(`Loaded ${Object.keys(coordMap).length} landmark coordinates`);

// Load tours
const toursSrc = fs.readFileSync(path.join(__dirname, '../data/tours.ts'), 'utf8');

// Extract tour data - parse stops to get landmark IDs in order
const tours = [];
const tourRegex = /id:\s*'([^']+)'[\s\S]*?stops:\s*\[([\s\S]*?)\][\s\S]*?routeCoordinates:\s*\[([\s\S]*?)\][\s\S]*?color:\s*'([^']+)'/g;
let tm;
while ((tm = tourRegex.exec(toursSrc)) !== null) {
  const tourId = tm[1];
  const stopsStr = tm[2];
  const routeStr = tm[3];
  const color = tm[4];
  
  // Extract landmark IDs from stops in order
  const stopIds = [];
  const stopRe = /landmarkId:\s*'([^']+)'/g;
  let sm;
  while ((sm = stopRe.exec(stopsStr)) !== null) {
    stopIds.push(sm[1]);
  }
  
  tours.push({ tourId, stopIds, color });
}

console.log(`Found ${tours.length} tours`);

async function getOSRMRoute(coordinates) {
  // Use OSRM foot profile via routing.openstreetmap.de
  const coords = coordinates.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  
  const resp = await fetch(url);
  const data = await resp.json();
  
  if (data.code !== 'Ok') {
    console.error(`  OSRM error: ${JSON.stringify(data.message || data)}`);
    return null;
  }
  
  const route = data.routes[0];
  const points = route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  const distanceMiles = (route.distance / 1609.34).toFixed(1);
  const durationHours = (route.duration / 3600).toFixed(1);
  
  return { points, distanceMiles, durationHours };
}

async function main() {
  for (const tour of tours) {
    console.log(`\nRouting ${tour.tourId} (${tour.stopIds.length} stops)...`);
    
    const coords = tour.stopIds.map(id => {
      const c = coordMap[id];
      if (!c) {
        console.error(`  WARNING: No coordinates for ${id}`);
        return null;
      }
      return c;
    }).filter(Boolean);
    
    if (coords.length < 2) {
      console.error(`  Skipping - need at least 2 coordinates`);
      continue;
    }
    
    // OSRM supports waypoints - use all stops as waypoints
    const result = await getOSRMRoute(coords);
    
    if (!result) {
      console.error(`  Failed to route ${tour.tourId}`);
      continue;
    }
    
    // Downsample to ~100 points max (OSRM can return thousands)
    let pts = result.points;
    if (pts.length > 100) {
      const step = Math.ceil(pts.length / 100);
      const sampled = [];
      for (let i = 0; i < pts.length; i += step) {
        sampled.push(pts[i]);
      }
      // Always include last point
      if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
        sampled.push(pts[pts.length - 1]);
      }
      pts = sampled;
    }
    
    console.log(`  ${pts.length} points, ${result.distanceMiles} mi, ~${result.durationHours} hrs`);
    
    // Update the tour source in-place
    // We'll collect all updates and write at the end
    tour.newRoute = pts;
    tour.newDistance = result.distanceMiles;
    tour.newDuration = result.durationHours;
    
    // Be nice to the free OSRM server
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Now rewrite tours.ts with new route coordinates
  let src = toursSrc;
  for (const tour of tours) {
    if (!tour.newRoute) continue;
    
    // Build the new routeCoordinates string
    const coordStr = tour.newRoute.map(p => 
      `      { latitude: ${p.latitude.toFixed(6)}, longitude: ${p.longitude.toFixed(6)} }`
    ).join(',\n');
    
    // Find and replace the routeCoordinates for this tour
    // We need to match the specific tour's block
    const tourStartRegex = new RegExp(`(id:\\s*'${tour.tourId}'[\\s\\S]*?)routeCoordinates:\\s*\\[([\\s\\S]*?)\\]([\\s\\S]*?distance:\\s*'[^']*'[^]*?duration:\\s*'[^']*')`, 'm');
    
    const match = src.match(tourStartRegex);
    if (match) {
      // Replace route coordinates
      src = src.replace(
        new RegExp(`(id:\\s*'${tour.tourId}'[\\s\\S]*?routeCoordinates:\\s*\\[)([\\s\\S]*?)(\\])`, 'm'),
        `$1\n${coordStr}\n    $3`
      );
      // Replace distance
      src = src.replace(
        new RegExp(`(id:\\s*'${tour.tourId}'[\\s\\S]*?distance:\\s*'[^']*')`, 'm'),
        `$1`.replace(/distance:\s*'[^']*'/, `distance: '${tour.newDistance} mi'`)
      );
    }
  }
  
  // Actually, let's do this more precisely with a different approach
  // Write a new file from scratch
  console.log('\nWriting updated tours...');
  
  // Simple approach: find each tour block and replace routeCoordinates and distance/duration
  let output = toursSrc;
  
  for (const tour of tours) {
    if (!tour.newRoute) continue;
    
    // Replace routeCoordinates block for this specific tour
    const escapedId = tour.tourId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Match from tour id to the closing color line
    const blockRegex = new RegExp(
      `(id:\\s*'${escapedId}',[\\s\\S]*?routeCoordinates:\\s*\\[)([\\s\\S]*?)(\\],[\\s\\S]*?distance:\\s*')([^']*)('[\\s\\S]*?duration:\\s*')([^']*)(')`,
      'm'
    );
    
    const coordStr = tour.newRoute.map(p => 
      `      { latitude: ${p.latitude.toFixed(6)}, longitude: ${p.longitude.toFixed(6)} }`
    ).join(',\n');
    
    output = output.replace(
      blockRegex,
      `$1\n${coordStr}\n    $3${tour.newDistance} mi$5${tour.newDuration} hrs$7`
    );
    
    console.log(`  Updated ${tour.tourId}`);
  }
  
  fs.writeFileSync(path.join(__dirname, '../data/tours.ts'), output);
  console.log('\nDone! tours.ts updated with OSRM road-following routes.');
}

main().catch(console.error);
