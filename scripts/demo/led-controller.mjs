#!/usr/bin/env node
// A fake vault Pi for testing PI_BASE_URL (see docs/testing.md): answers the
// vendor's GET /setGreen, /setRed and /setOff and prints every request with a
// timestamp and the light's new color. Plain Node, no dependencies.
//
// Sends CORS headers, so the kiosk browser route can read its answers; the
// vendor hasn't confirmed the real Pi does (LED_CORS=0 acts like it doesn't).
//
//   node scripts/demo/led-controller.mjs                 # listens on http://127.0.0.1:8765
//   LED_PORT=9000 node scripts/demo/led-controller.mjs
//   LED_STATUS=503 node scripts/demo/led-controller.mjs  # reject every request, to see "unconfirmed"
//   LED_CORS=0 node scripts/demo/led-controller.mjs      # no CORS headers: the browser route can't read answers
import console from "node:console";
import { createServer } from "node:http";
import process from "node:process";
import { URL } from "node:url";

const port = Number(process.env.LED_PORT || 8765);
const status = Number(process.env.LED_STATUS || 200);
const cors = process.env.LED_CORS !== "0";
const started = Date.now();
const log = (...parts) => console.log(`+${((Date.now() - started) / 1000).toFixed(1)}s`, ...parts);
const COLORS = { "/setGreen": "green", "/setRed": "red", "/setOff": "off" };

let light = "off";

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://pi").pathname;
  if (cors) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // For browsers that preflight requests from a public page to a private address.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  // Browsers send an Origin on CORS requests; the app server and a browser's
  // no-cors retry don't.
  const from = req.headers.origin ? `(browser at ${req.headers.origin})` : "(no Origin: server, or browser no-cors)";
  if (req.method === "OPTIONS") {
    log("OPTIONS", path, from, cors ? "-> 204" : "-> 204, no CORS");
    return res.writeHead(204).end();
  }
  const color = req.method === "GET" ? COLORS[path] : undefined;
  if (!color) {
    log(req.method, path, from, "-> 404");
    return res.writeHead(404).end("Not found\n");
  }
  if (status < 200 || status > 299) {
    log("GET", path, from, `-> ${status}, light stays ${light}`);
    return res.writeHead(status).end(`Error ${status}\n`);
  }
  light = color;
  log("GET", path, from, `-> ${status}, light is ${light}`);
  res.writeHead(status).end(status === 204 ? undefined : "OK\n");
});

server.listen(port, "127.0.0.1", () =>
  log(`fake vault Pi on http://127.0.0.1:${port}, light is ${light}, CORS ${cors ? "on" : "off"} (Ctrl-C to stop)`),
);
