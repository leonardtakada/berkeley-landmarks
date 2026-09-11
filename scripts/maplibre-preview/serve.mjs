// Tiny static server with HTTP Range support (needed by pmtiles JS).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = import.meta.dirname;
const types = { ".html": "text/html", ".json": "application/json", ".pbf": "application/octet-stream", ".pmtiles": "application/octet-stream" };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(root, p === "/" ? "index.html" : p);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = +m[1];
    const end = m[2] ? +m[2] : Math.min(start + 1024 * 1024 - 1, stat.size - 1); // 1MB chunks
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Content-Length": end - start + 1,
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(8791, () => console.log("ready on 8791"));
