import { beforeEach, describe, expect, it, vi } from "vitest";

const { commitMindMapSnapshot, recoveryMindMapCommand } = vi.hoisted(() => {
  const commitMindMapSnapshot = vi.fn();
  const recoveryMindMapCommand = vi.fn(
    (mindMap: { command?: { recovery?: () => void } }) => {
      mindMap.command?.recovery?.();
    },
  );
  return { commitMindMapSnapshot, recoveryMindMapCommand };
});

vi.mock("./native/web/src/utils/mindMapAiCommandBridge.js", () => ({
  commitMindMapSnapshot,
  recoveryMindMapCommand,
}));

import { commitMindMapAiSession } from "./native/web/src/utils/mindMapAiPersistCommit";

describe("commitMindMapAiSession", () => {
  beforeEach(() => {
    commitMindMapSnapshot.mockReset();
    recoveryMindMapCommand.mockClear();
    commitMindMapSnapshot.mockImplementation(
      (mindMap: { command?: { originAddHistory?: () => void } }) => {
        mindMap.command?.originAddHistory?.();
      },
    );
  });

  it("emits data_change when history dedup skips a real mutation", () => {
    const emit = vi.fn();
    const recovery = vi.fn();
    const originAddHistory = vi.fn();
    const snapshot = { root: { data: { text: "changed" } } };
    const mindMap = {
      render: vi.fn(),
      emit,
      command: {
        isPause: true,
        history: [{ id: 1 }],
        activeHistoryIndex: 0,
        recovery,
        originAddHistory,
        getCopyData: vi.fn(() => snapshot),
      },
    };
    const debug = vi.fn();

    const committed = commitMindMapAiSession(
      mindMap,
      { baseFullData: { root: { data: { text: "before" } } }, appliedCount: 1 },
      { debug },
    );

    expect(recoveryMindMapCommand).toHaveBeenCalledWith(mindMap);
    expect(recovery).toHaveBeenCalled();
    expect(mindMap.render).toHaveBeenCalled();
    expect(commitMindMapSnapshot).toHaveBeenCalledWith(mindMap, debug);
    expect(committed).toBe(false);
    expect(emit).toHaveBeenCalledWith("data_change", snapshot);
    expect(debug).toHaveBeenCalledWith(
      "mindmap-persist",
      "commitMindMapAiSession fallback data_change",
      expect.objectContaining({ reason: "history-dedup-skipped" }),
    );
  });

  it("skips commit render when tree mutation already triggered a full render", () => {
    const render = vi.fn();
    const mindMap = {
      render,
      command: {
        history: [{ id: 1 }],
        activeHistoryIndex: 0,
        recovery: vi.fn(),
        originAddHistory: vi.fn(),
        getCopyData: vi.fn(() => ({ root: {} })),
      },
      renderer: {
        renderOrchestrator: {
          shouldSkipCommitRender: vi.fn(() => true),
        },
      },
    };
    commitMindMapSnapshot.mockImplementation(
      (map: { command: { history: unknown[]; activeHistoryIndex: number } }) => {
        map.command.history.push({ id: 2 });
        map.command.activeHistoryIndex = 1;
      },
    );

    const committed = commitMindMapAiSession(mindMap, { appliedCount: 2 });

    expect(render).not.toHaveBeenCalled();
    expect(committed).toBe(true);
  });

  it("skips fallback data_change when history records the mutation", () => {
    const emit = vi.fn();
    const mindMap = {
      render: vi.fn(),
      emit,
      command: {
        history: [{ id: 1 }],
        activeHistoryIndex: 0,
        recovery: vi.fn(),
        originAddHistory: vi.fn(),
        getCopyData: vi.fn(() => ({ root: {} })),
      },
    };
    commitMindMapSnapshot.mockImplementation(
      (map: { command: { history: unknown[]; activeHistoryIndex: number } }) => {
        map.command.history.push({ id: 2 });
        map.command.activeHistoryIndex = 1;
      },
    );

    const committed = commitMindMapAiSession(mindMap, { appliedCount: 1 });

    expect(committed).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });
});
