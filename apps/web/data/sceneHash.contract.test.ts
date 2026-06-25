import {
  cleanAppStateForExport,
  clearAppStateForDatabase,
  getDefaultAppState,
} from "@excalidraw/excalidraw/appState";

import { describe, expect, it } from "vitest";

import { CONTENT_APP_STATE_KEYS } from "./sceneHash";

/**
 * The fingerprint's content-key allowlist is a hand-kept copy (sceneHash stays
 * out of the editor bundle). This contract pins that copy to Excalidraw's own
 * authority — `APP_STATE_STORAGE_CONF` via its `cleanAppStateForExport` /
 * `clearAppStateForDatabase` projections — so a new persisted appState key
 * upstream fails here instead of silently breaking dirty detection.
 */
describe("sceneHash content-key contract", () => {
  it("mirrors Excalidraw's persisted (export/server) document appState", () => {
    const fullAppState = getDefaultAppState();

    const exportKeys = Object.keys(cleanAppStateForExport(fullAppState)).sort();
    const serverKeys = Object.keys(
      clearAppStateForDatabase(fullAppState),
    ).sort();
    const ours = [...CONTENT_APP_STATE_KEYS].sort();

    expect(ours).toEqual(exportKeys);
    // export & server views coincide for what counts as document content.
    expect(serverKeys).toEqual(exportKeys);
  });
});
