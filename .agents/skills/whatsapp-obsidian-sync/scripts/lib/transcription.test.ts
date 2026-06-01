import test from "node:test";
import assert from "node:assert/strict";
import { isAudioMimeType } from "./transcription.js";

test("isAudioMimeType detects audio payloads", () => {
  assert.equal(isAudioMimeType("audio/ogg"), true);
  assert.equal(isAudioMimeType("audio/mpeg"), true);
  assert.equal(isAudioMimeType("image/png"), false);
  assert.equal(isAudioMimeType(undefined), false);
});
