import assert from "node:assert/strict";
import {
  SpeechTranscriptAccumulator,
  type SpeechRecognitionResultLike
} from "../src/speech-transcript.js";

function result(text: string, isFinal: boolean): SpeechRecognitionResultLike {
  return Object.assign([{ transcript: text }], { isFinal });
}

const transcript = new SpeechTranscriptAccumulator();
transcript.accept({
  resultIndex: 0,
  results: [result("Please", true), result("quote five", false)]
});
assert.equal(transcript.text, "Please quote five");
assert.equal(transcript.finalText, "Please");

transcript.accept({
  resultIndex: 1,
  results: [
    result("Please", true),
    result("quote five hundred Aurora control boards", true),
    result("for next Friday", false)
  ]
});
assert.equal(
  transcript.text,
  "Please quote five hundred Aurora control boards for next Friday"
);
assert.equal(
  transcript.finalText,
  "Please quote five hundred Aurora control boards"
);

transcript.accept({
  resultIndex: 2,
  results: [
    result("Please", true),
    result("quote five hundred Aurora control boards", true),
    result("for delivery next Friday", true)
  ]
});
assert.equal(
  transcript.finalText,
  "Please quote five hundred Aurora control boards for delivery next Friday"
);

console.log("speech-transcript tests passed");
