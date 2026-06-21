import { randomUUID } from "node:crypto";
import { readEvents, readJson, workflowPathFor, writeJson } from "../../core-engine/src/store.mjs";

export function buildYouTubeWorkflow({ session, events = [], query = "study jazz music" }) {
  const eventIds = events.map((event) => event.id);
  return {
    schema_version: 1,
    kind: "workflow",
    id: `wf_youtube_${randomUUID().slice(0, 8)}`,
    name: "youtube-play-music",
    description: "Open Chrome, search YouTube for music, click a playable result, skip ads when possible, and verify playback.",
    compiled_from_session_id: session?.id ?? null,
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        default: query
      }
    ],
    safety: {
      disallowed_controls: ["sign in", "subscribe", "like", "comment", "share", "upload", "purchase"],
      external_side_effects: "media_playback_only"
    },
    steps: [
      step("step_open_chrome", "Open or focus Chrome", eventIds, {
        kind: "open_app",
        app_name: "Google Chrome"
      }, [{ kind: "exists", target: { kind: "app", name: "Google Chrome" }, timeout_ms: 5000 }]),
      step("step_open_youtube", "Open YouTube", eventIds, {
        kind: "navigate",
        url: "https://www.youtube.com"
      }, [{ kind: "url_contains", value: "youtube.com", timeout_ms: 10000 }]),
      step("step_search_music", "Search fixed music query", eventIds, {
        kind: "type",
        text: { mode: "variable", name: "query", sensitive: false, default_value: query },
        submit: true
      }, [{ kind: "url_contains", value: "search_query", timeout_ms: 10000 }], {
        primary: { kind: "ax", role: "AXTextField", title: "Search" },
        fallbacks: [
          { kind: "text", text: "Search" },
          { kind: "text", text: "搜索" },
          { kind: "css", selector: "input#search" }
        ]
      }),
      step("step_click_first_result", "Click first playable result", eventIds, {
        kind: "click",
        target_strategy: "first_video_result"
      }, [{ kind: "url_contains", value: "watch", timeout_ms: 12000 }], {
        primary: { kind: "css", selector: "ytd-video-renderer a#video-title" },
        fallbacks: [
          { kind: "text", text: "video" },
          { kind: "text", text: "音乐" }
        ]
      }),
      step("step_skip_ad_if_visible", "Skip ad if a visible skip button appears", eventIds, {
        kind: "skip_ad_if_visible",
        labels: ["Skip", "Skip Ads", "跳过", "跳过广告"]
      }, [{ kind: "exists", target: { kind: "css", selector: "video" }, timeout_ms: 15000 }]),
      step("step_assert_playback", "Verify playback started", eventIds, {
        kind: "assert_playback_started"
      }, [{ kind: "playback_started", timeout_ms: 15000 }])
    ]
  };
}

export async function compileWorkflow({ session, sessionFile, out = "workflows", query = "study jazz music" }) {
  const resolvedSession = session ?? await readJson(sessionFile);
  const events = await readEvents(resolvedSession.artifacts.events_path);
  const workflow = buildYouTubeWorkflow({ session: resolvedSession, events, query });
  const workflowPath = workflowPathFor(out, workflow.name);
  await writeJson(workflowPath, workflow);
  return { workflow, workflowPath };
}

function step(id, name, sourceEventIds, action, assertions, target = null) {
  return {
    id,
    name,
    source_event_ids: sourceEventIds,
    context: {
      app: {
        bundle_id: "com.google.Chrome",
        name: "Google Chrome"
      }
    },
    ...(target ? { target } : {}),
    action,
    assertions,
    timeout_ms: Math.max(...assertions.map((assertion) => assertion.timeout_ms ?? 5000), 5000),
    risk_level: "low"
  };
}
