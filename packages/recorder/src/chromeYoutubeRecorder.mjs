#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const eventsPath = args.events;
const sessionPath = args.session;

if (!eventsPath || !sessionPath) {
  console.error("Usage: chromeYoutubeRecorder --session <session.json> --events <events.jsonl>");
  process.exit(2);
}

let stopped = false;
let seq = await nextEventId(eventsPath);
let previous = null;

process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});

await append({
  kind: "recorder.started",
  timestamp: new Date().toISOString(),
  recorder: { kind: "chrome-youtube-poller" }
});

while (!stopped) {
  const state = await captureChromeState();
  if (state.ok) {
    await emitStateChanges(state);
  } else if (!previous || previous.error !== state.error) {
    await append({
      kind: "recorder.observation_failed",
      timestamp: new Date().toISOString(),
      error: state.error
    });
    previous = { error: state.error };
  }
  await sleep(750);
}

await append({
  kind: "recorder.stopped",
  timestamp: new Date().toISOString(),
  recorder: { kind: "chrome-youtube-poller" }
});

async function emitStateChanges(state) {
  const current = state.payload;
  if (!previous || previous.url !== current.url || previous.title !== current.title) {
    await append({
      kind: "window.changed",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      ax: { mode: previous ? "diffFromPrevious" : "fullTree", text: current.visible_text }
    });
  }

  const query = queryFromUrl(current.url);
  const previousQuery = previous ? queryFromUrl(previous.url) : null;
  if (query && query !== previousQuery) {
    await append({
      kind: "keyboard.text_input",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      keyboard: {
        text: query,
        target: { role: "AXTextField", title: "Search", value: query }
      }
    });
    await append({
      kind: "keyboard.submit",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      keyboard: { keyEquivalent: "return", target: { role: "AXTextField", title: "Search" } }
    });
  }

  if (isWatchUrl(current.url) && (!previous || !isWatchUrl(previous.url))) {
    await append({
      kind: "mouse.click",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      mouse: {
        button: "left",
        target: { role: "AXLink", title: current.title || "YouTube video" }
      }
    });
  }

  if (current.skip_ad_visible && !previous?.skip_ad_visible) {
    await append({
      kind: "ui.control.visible",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      control: { role: "AXButton", labels: ["Skip", "Skip Ads", "跳过", "跳过广告"] }
    });
  }

  if (current.video?.playing && !previous?.video?.playing) {
    await append({
      kind: "media.playback_started",
      timestamp: new Date().toISOString(),
      app: { name: "Google Chrome", bundle_id: "com.google.Chrome" },
      window: { title: current.title, url: current.url },
      media: current.video
    });
  }

  previous = current;
}

async function captureChromeState() {
  const js = `
    (() => {
      const text = document.body ? document.body.innerText.slice(0, 4000) : '';
      const video = document.querySelector('video');
      const buttons = [...document.querySelectorAll('button, .ytp-ad-skip-button, .ytp-skip-ad-button')];
      const labels = ['Skip', 'Skip Ads', '跳过', '跳过广告'];
      const skip = buttons.some((button) => labels.some((label) => (button.innerText || button.ariaLabel || '').includes(label)));
      return JSON.stringify({
        title: document.title,
        url: location.href,
        visible_text: text,
        active_element: document.activeElement ? {
          tag: document.activeElement.tagName,
          role: document.activeElement.getAttribute('role'),
          aria_label: document.activeElement.getAttribute('aria-label'),
          value: document.activeElement.value || ''
        } : null,
        skip_ad_visible: skip,
        video: video ? {
          current_time: video.currentTime,
          duration: video.duration,
          paused: video.paused,
          muted: video.muted,
          ready_state: video.readyState,
          playing: !video.paused && video.currentTime >= 0
        } : null
      });
    })()
  `;
  const script = `
    tell application "Google Chrome"
      if not running then error "Google Chrome is not running"
      if not (exists front window) then error "Google Chrome has no front window"
      execute active tab of front window javascript ${JSON.stringify(js)}
    end tell
  `;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
    return { ok: true, payload: JSON.parse(stdout.trim()) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function append(event) {
  const row = {
    id: `rec_${seq++}`,
    ...event
  };
  await appendFile(eventsPath, `${JSON.stringify(row)}\n`, "utf8");
}

async function nextEventId(file) {
  try {
    const raw = await readFile(file, "utf8");
    const ids = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).id).filter(Number.isFinite);
    return ids.length ? Math.max(...ids) + 1 : 1;
  } catch {
    return 1;
  }
}

function queryFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("search_query");
  } catch {
    return null;
  }
}

function isWatchUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") && parsed.pathname === "/watch";
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    parsed[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
