import { describe, expect, it } from "vitest";

import { needsRestoreBackupOffer } from "./checkpointContentStatus";

describe("checkpointContentStatus", () => {
  it("skips restore backup offer when latest is already archived", () => {
    expect(
      needsRestoreBackupOffer({
        isAlreadyArchived: true,
      }),
    ).toBe(false);
  });

  it("offers restore backup when latest has no matching archive", () => {
    expect(
      needsRestoreBackupOffer({
        isAlreadyArchived: false,
      }),
    ).toBe(true);
  });
});
