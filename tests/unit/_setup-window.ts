/**
 * Test setup side-effect: stub the browser `window` global BEFORE the module
 * under test (and its `@particle-academy/agent-integrations/sharing` import) is
 * evaluated. Imported for its side effect ahead of `src/lib/session`, which lets
 * the test use plain static imports instead of top-level `await import(...)`
 * (the latter fails under tsx's CJS transform).
 */
export const TEST_ORIGIN = "http://192.168.1.104:3000";

(globalThis as unknown as { window: unknown }).window = {
  location: { origin: TEST_ORIGIN },
};
