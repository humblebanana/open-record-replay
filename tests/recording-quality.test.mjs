import test from "node:test";
import assert from "node:assert/strict";
import { listQualitySources, profileRecording } from "../packages/core-engine/src/recordingQuality.mjs";
import { readEvents } from "../packages/core-engine/src/store.mjs";

test("loads official source-of-truth recordings", async () => {
  const sources = await listQualitySources();
  assert.deepEqual(sources.map((source) => source.id), ["feishu-file-send", "youtube-play-video"]);

  const feishu = sources.find((source) => source.id === "feishu-file-send");
  assert.equal(feishu.profile.event_count, 20);
  assert.equal(feishu.profile.event_counts["mouse.click"], 4);
  assert.equal(feishu.profile.event_counts["mouse.drag"], 1);
  assert.equal(feishu.profile.rich_selected_item_count, 4);
  assert.equal(feishu.profile.screenshot_event_count, 0);

  const youtube = sources.find((source) => source.id === "youtube-play-video");
  assert.equal(youtube.profile.event_count, 23);
  assert.equal(youtube.profile.event_counts["keyboard.text_input"], 3);
  assert.equal(youtube.profile.event_counts["selection.changed"], 5);
  assert.equal(youtube.profile.screenshot_event_count, 0);
});

test("profiles copied official fixtures without screenshots as primary evidence", async () => {
  const sources = await listQualitySources();
  for (const source of sources) {
    const events = await readEvents(source.eventsPath);
    const profile = profileRecording(events);
    assert.equal(profile.screenshot_event_count, 0);
    assert.ok(profile.ax_text_chars >= 40_000);
    assert.ok(profile.mouse_target_event_count >= 3);
    assert.ok(profile.keyboard_target_event_count >= 2);
  }
});
