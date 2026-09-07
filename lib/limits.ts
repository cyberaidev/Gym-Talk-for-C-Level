export const LIMITS = {
  recordingSeconds: 120,
  audioBytes: 8 * 1024 * 1024,
  multipartBytes: 8 * 1024 * 1024 + 64 * 1024,
  jsonBytes: 64 * 1024,
  questionCharacters: 2_000,
  transcriptCharacters: 12_000,
  speechCharacters: 4_000,
  requestMilliseconds: 60_000,
  requestsPerMinute: 30,
  requestsPerDay: 300,
  concurrentRequests: 3
} as const;
