import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function executeYouTubeStep(step, variables = {}) {
  switch (step.action.kind) {
    case "open_app":
      await execFileAsync("open", ["-a", step.action.app_name]);
      if (step.action.app_name === "Google Chrome") await activateChrome();
      return { ok: true, message: `Opened ${step.action.app_name}` };
    case "navigate":
      await execFileAsync("open", ["-a", "Google Chrome", step.action.url]);
      await activateChrome();
      return { ok: true, message: `Navigated to ${step.action.url}` };
    case "type": {
      const query = encodeURIComponent(variables.query ?? step.action.text?.default_value ?? "study jazz music");
      await execFileAsync("open", ["-a", "Google Chrome", `https://www.youtube.com/results?search_query=${query}`]);
      await activateChrome();
      return { ok: true, message: "Submitted YouTube search query" };
    }
    case "click":
      {
        const href = await waitForFirstWatchHref();
        if (!href.includes("/watch")) throw new Error(`No playable watch URL returned: ${href}`);
        await execFileAsync("open", ["-a", "Google Chrome", href]);
        await activateChrome();
        await sleep(5000);
      }
      return { ok: true, message: "Clicked first playable result" };
    case "skip_ad_if_visible":
      await runChromeJs(`
        const labels = ['Skip', 'Skip Ads', '跳过', '跳过广告'];
        const buttons = [...document.querySelectorAll('button, .ytp-ad-skip-button, .ytp-skip-ad-button')];
        const skip = buttons.find((button) => labels.some((label) => (button.innerText || button.ariaLabel || '').includes(label)));
        if (skip) skip.click();
        return skip ? 'skipped' : 'not-visible';
      `);
      return { ok: true, message: "Skipped ad if visible" };
    case "assert_playback_started": {
      await runChromeJs(`
        const video = document.querySelector('video');
        if (video && video.paused) video.play();
        return video ? 'play-requested' : 'missing-video';
      `);
      await sleep(3500);
      const { stdout } = await runChromeJs(`
        const video = document.querySelector('video');
        if (!video) return 'missing-video';
        else {
          return (!video.paused || video.currentTime > 0 || video.readyState >= 3) ? 'playing' : 'not-playing';
        }
      `);
      const playing = stdout.includes("playing");
      return { ok: playing, message: playing ? "Playback started" : "Playback did not start" };
    }
    default:
      return { ok: false, message: `Unsupported action kind: ${step.action.kind}` };
  }
}

async function runChromeJs(source) {
  await activateChrome();
  const script = `
    tell application "Google Chrome"
      if not (exists front window) then error "Chrome has no front window"
      execute active tab of front window javascript ${JSON.stringify(wrapJs(source))}
    end tell
  `;
  return execFileAsync("osascript", ["-e", script], { timeout: 30000 });
}

async function activateChrome() {
  try {
    await execFileAsync("osascript", ["-e", `tell application "Google Chrome" to activate`], { timeout: 5000 });
  } catch {
    // Activation improves recording visibility, but replay correctness is verified separately.
  }
  await sleep(500);
}

function wrapJs(source) {
  return `(() => { ${source} })()`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFirstWatchHref(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = "missing value";
  while (Date.now() < deadline) {
    const { stdout } = await runChromeJs(`
      const preferred = [...document.querySelectorAll('ytd-video-renderer a#video-title[href*="/watch"], ytd-video-renderer a.yt-simple-endpoint[href*="/watch"]')];
      const fallback = [...document.querySelectorAll('a[href*="/watch"]')].filter((link) => {
        const label = (link.innerText || link.getAttribute('title') || '').trim().toLowerCase();
        return label && !['watch', 'subscribe', 'start now', 'learn more'].includes(label);
      });
      const links = [...preferred, ...fallback];
      const first = links.find((link) => {
        const rect = link.getBoundingClientRect();
        const text = (link.innerText || link.getAttribute('title') || '').trim();
        const href = link.href || '';
        const promoted = link.closest('ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-action-companion-ad-renderer');
        return rect.width > 0 && rect.height > 0 && text && href.includes('/watch') && !promoted;
      });
      return first ? first.href : '';
    `);
    last = stdout.trim();
    if (last.includes("/watch")) return last;
    await sleep(1000);
  }
  throw new Error(`No playable YouTube result found before timeout; last=${last || "empty"}`);
}
