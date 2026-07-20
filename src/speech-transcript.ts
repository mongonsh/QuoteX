export interface SpeechRecognitionResultLike
  extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export class SpeechTranscriptAccumulator {
  private readonly segments = new Map<number, { text: string; isFinal: boolean }>();

  accept(event: SpeechRecognitionEventLike): void {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = String(result?.[0]?.transcript || "").replace(/\s+/g, " ").trim();
      if (!text) continue;

      this.segments.set(index, { text, isFinal: result.isFinal !== false });
    }
  }

  get text(): string {
    return [...this.segments.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, segment]) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  get finalText(): string {
    return [...this.segments.entries()]
      .filter(([, segment]) => segment.isFinal)
      .sort(([left], [right]) => left - right)
      .map(([, segment]) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
