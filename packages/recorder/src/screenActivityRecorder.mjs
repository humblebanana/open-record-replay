#!/usr/bin/env node
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const eventsPath = args.events;
const sessionPath = args.session;
const screenshotsDir = args.screenshots;
const intervalMs = Number(args.interval ?? 1000);

if (!eventsPath || !sessionPath || !screenshotsDir) {
  console.error("Usage: screenActivityRecorder --session <session.json> --events <events.jsonl> --screenshots <dir>");
  process.exit(2);
}

let stopped = false;
let seq = await nextEventId(eventsPath);
let previousWindowKey = null;
let previousBrowserKey = null;
let previousVideoPlaying = false;
let screenshotCount = 0;
let observationError = null;

process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});

await mkdir(screenshotsDir, { recursive: true });
await append({
  kind: "recorder.started",
  timestamp: new Date().toISOString(),
  recorder: {
    kind: "screen-activity-poller",
    interval_ms: intervalMs,
    captures: ["frontmost_app", "frontmost_window", "screenshot", "browser_page_when_available"]
  }
});

while (!stopped) {
  const timestamp = new Date().toISOString();
  await captureTick(timestamp);
  await sleep(intervalMs);
}

await writeManifest();
await append({
  kind: "recorder.stopped",
  timestamp: new Date().toISOString(),
  recorder: { kind: "screen-activity-poller", screenshots: screenshotCount }
});

async function captureTick(timestamp) {
  const appWindow = await captureFrontmostWindow();
  const screenshot = await captureScreenshot(timestamp);

  if (appWindow.ok) {
    observationError = null;
    const current = appWindow.payload;
    const currentKey = JSON.stringify(current);
    if (currentKey !== previousWindowKey) {
      await append({
        kind: "window.changed",
        timestamp,
        app: {
          name: current.app_name,
          bundle_id: current.bundle_id || null,
          pid: current.pid || null
        },
        window: {
          title: current.window_title || "",
          position: current.window_position || null,
          size: current.window_size || null
        },
        ax: {
          mode: previousWindowKey ? "diffFromPrevious" : "fullTree",
          source: "macos-accessibility",
          text: current.window_title || current.app_name
        }
      });
      previousWindowKey = currentKey;
    }
  } else {
    await appendObservationFailure(timestamp, "frontmost_window", appWindow.error);
  }

  if (screenshot.ok) {
    screenshotCount += 1;
    await append({
      kind: "screen.screenshot",
      timestamp,
      screenshot: {
        path: screenshot.path,
        sequence: screenshotCount,
        format: "png"
      }
    });
  } else {
    await appendObservationFailure(timestamp, "screenshot", screenshot.error);
  }

  if (appWindow.ok && isSupportedBrowser(appWindow.payload.app_name)) {
    const browser = await captureBrowserPage(appWindow.payload.app_name);
    if (browser.ok) {
      const page = browser.payload;
      const browserKey = JSON.stringify({
        browser: appWindow.payload.app_name,
        title: page.title,
        url: page.url,
        active_element: page.active_element,
        visible_text: page.visible_text?.slice(0, 1000)
      });
      if (browserKey !== previousBrowserKey) {
        await append({
          kind: "browser.page_observed",
          timestamp,
          app: {
            name: appWindow.payload.app_name,
            bundle_id: appWindow.payload.bundle_id || null,
            pid: appWindow.payload.pid || null
          },
          window: { title: page.title, url: page.url },
          browser: page,
          ax: {
            mode: previousBrowserKey ? "diffFromPrevious" : "fullTree",
            source: "browser-dom",
            text: page.visible_text
          }
        });
        previousBrowserKey = browserKey;
      }

      if (page.video?.playing && !previousVideoPlaying) {
        await append({
          kind: "media.playback_started",
          timestamp,
          app: {
            name: appWindow.payload.app_name,
            bundle_id: appWindow.payload.bundle_id || null,
            pid: appWindow.payload.pid || null
          },
          window: { title: page.title, url: page.url },
          media: page.video
        });
      }
      previousVideoPlaying = Boolean(page.video?.playing);
    } else {
      await appendObservationFailure(timestamp, "browser_page", browser.error);
    }
  }
}

async function captureFrontmostWindow() {
  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set appPid to unix id of frontApp
      try
        set bundleId to bundle identifier of frontApp
      on error
        set bundleId to ""
      end try
      set windowTitle to ""
      set windowPosition to ""
      set windowSize to ""
      try
        if exists window 1 of frontApp then
          set windowTitle to name of window 1 of frontApp
          set windowPosition to position of window 1 of frontApp as text
          set windowSize to size of window 1 of frontApp as text
        end if
      end try
      return appName & linefeed & appPid & linefeed & bundleId & linefeed & windowTitle & linefeed & windowPosition & linefeed & windowSize
    end tell
  `;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
    const [appName, pid, bundleId, windowTitle, windowPosition, windowSize] = stdout.replace(/\r/g, "").split("\n");
    return {
      ok: true,
      payload: {
        app_name: appName || "",
        pid: Number(pid) || null,
        bundle_id: bundleId || null,
        window_title: windowTitle || "",
        window_position: parseAppleScriptPair(windowPosition),
        window_size: parseAppleScriptPair(windowSize)
      }
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function captureScreenshot(timestamp) {
  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const file = path.join(screenshotsDir, `${String(screenshotCount + 1).padStart(6, "0")}_${safeTimestamp}.png`);
  try {
    await execFileAsync("screencapture", ["-x", file], { timeout: 10000 });
    return { ok: true, path: file };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function captureBrowserPage(appName) {
  const js = `
    (() => {
      const visibleText = document.body ? document.body.innerText.slice(0, 6000) : '';
      const active = document.activeElement;
      const video = document.querySelector('video');
      const buttons = [...document.querySelectorAll('button, .ytp-ad-skip-button, .ytp-skip-ad-button')];
      const skipLabels = ['Skip', 'Skip Ads', '跳过', '跳过广告'];
      return JSON.stringify({
        title: document.title,
        url: location.href,
        visible_text: visibleText,
        active_element: active ? {
          tag: active.tagName,
          role: active.getAttribute('role'),
          aria_label: active.getAttribute('aria-label'),
          value: active.value || ''
        } : null,
        controls: {
          skip_ad_visible: buttons.some((button) => skipLabels.some((label) => (button.innerText || button.ariaLabel || '').includes(label)))
        },
        video: video ? {
          current_time: video.currentTime,
          duration: Number.isFinite(video.duration) ? video.duration : null,
          paused: video.paused,
          muted: video.muted,
          ready_state: video.readyState,
          playing: !video.paused && video.readyState >= 2
        } : null
      });
    })()
  `;
  const escapedJs = JSON.stringify(js);
  const script = appName === "Safari" ? `
    tell application "Safari"
      if not running then error "Safari is not running"
      if not (exists front document) then error "Safari has no front document"
      do JavaScript ${escapedJs} in front document
    end tell
  ` : `
    tell application "Google Chrome"
      if not running then error "Google Chrome is not running"
      if not (exists front window) then error "Google Chrome has no front window"
      execute active tab of front window javascript ${escapedJs}
    end tell
  `;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
    return { ok: true, payload: JSON.parse(stdout.trim()) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function appendObservationFailure(timestamp, source, error) {
  const key = `${source}:${error}`;
  if (observationError === key) return;
  observationError = key;
  await append({
    kind: "recorder.observation_failed",
    timestamp,
    observation: { source },
    error
  });
}

async function writeManifest() {
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  const manifestPath = session.artifacts?.recording_manifest_path;
  if (!manifestPath) return;
  const eventsRaw = await readFile(eventsPath, "utf8");
  const eventCount = eventsRaw.split(/\r?\n/).filter(Boolean).length;
  await writeFile(manifestPath, `${JSON.stringify({
    schema_version: 1,
    kind: "recording_manifest",
    session_id: session.id,
    events_path: eventsPath,
    screenshots_dir: screenshotsDir,
    event_count: eventCount,
    screenshot_count: screenshotCount,
    generated_at: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
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
    return raw.split(/\r?\n/).filter(Boolean).length + 1;
  } catch {
    return 1;
  }
}

function isSupportedBrowser(appName) {
  return appName === "Google Chrome" || appName === "Safari";
}

function parseAppleScriptPair(value) {
  if (!value) return null;
  const parts = String(value).split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1] };
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
