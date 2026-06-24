import { isEffectivelyEmptyMindMapData } from "../../data/formats/MindMapAdapter";
import {
  compareMindMapTreeIntegrityRegression,
  summarizeMindMapTreeIntegrity,
  type MindMapTreeIntegritySummary,
} from "./mindMapPersistDebug";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapSaveSnapshotValidation = {
  accepted: boolean;
  rejectionReasons: string[];
  regressionReasons: string[];
  previousIntegrity: MindMapTreeIntegritySummary | null;
  incomingIntegrity: MindMapTreeIntegritySummary;
};

/**
 * Explicit saves must either persist the native snapshot or fail. This helper
 * only rejects snapshots that are clearly transient/corrupt, not legitimate
 * user edits such as deleting or restructuring nodes.
 */
export function validateMindMapSaveSnapshot(opts: {
  previousData: MindMapDocumentData | null;
  incomingData: MindMapDocumentData;
}): MindMapSaveSnapshotValidation {
  const previousIntegrity = opts.previousData
    ? summarizeMindMapTreeIntegrity(opts.previousData)
    : null;
  const incomingIntegrity = summarizeMindMapTreeIntegrity(opts.incomingData);
  const regression = previousIntegrity
    ? compareMindMapTreeIntegrityRegression(previousIntegrity, incomingIntegrity)
    : { regressed: false, reasons: [] };
  const previousHadContent =
    !!opts.previousData && !isEffectivelyEmptyMindMapData(opts.previousData);
  const incomingIsEmpty = isEffectivelyEmptyMindMapData(opts.incomingData);
  const rejectionReasons =
    previousHadContent && incomingIsEmpty
      ? ["incoming-empty-after-non-empty-previous"]
      : [];

  return {
    accepted: rejectionReasons.length === 0,
    rejectionReasons,
    regressionReasons: regression.reasons,
    previousIntegrity,
    incomingIntegrity,
  };
}
