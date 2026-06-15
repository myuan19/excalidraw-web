import { describe, expect, it, vi } from "vitest";

import {
  applyAiAddChild,
  applyAiOrganizeResultToMindMap,
  applyAiUpdateNodeData,
  findAiDataNodeByUid,
} from "./native/web/src/utils/mindMapAiNodeMutation";

describe("mindMapAiNodeMutation", () => {
  it("routes updates through setNodeDataRender when a node instance exists", () => {
    const setNodeDataRender = vi.fn();
    const mindMap = {
      renderer: {
        findNodeByUid: vi.fn(() => ({ uid: "n1" })),
        setNodeDataRender,
        renderTree: null,
      },
    };

    const result = applyAiUpdateNodeData(mindMap, "n1", { text: "hello" }, {
      deferRender: true,
    });

    expect(result).toEqual({ ok: true, via: "setNodeDataRender" });
    expect(setNodeDataRender).toHaveBeenCalledWith(
      { uid: "n1" },
      { text: "hello" },
      true,
    );
  });

  it("falls back to renderTree and marks needUpdate when no node instance exists", () => {
    const mindMap = {
      renderer: {
        findNodeByUid: vi.fn(() => null),
        renderTree: {
          data: { uid: "root" },
          children: [
            {
              data: { uid: "n1", text: "old" },
              children: [],
            },
          ],
        },
      },
    };

    const result = applyAiUpdateNodeData(mindMap, "n1", { text: "new" });

    expect(result).toEqual({ ok: true, via: "tree" });
    expect(findAiDataNodeByUid(mindMap, "n1")).not.toBeNull();
    const node = mindMap.renderer.renderTree.children[0] as {
      data: { text: string; needUpdate?: boolean };
    };
    expect(node.data.text).toBe("new");
    expect(node.data.needUpdate).toBe(true);
  });

  it("applies organize results via gateway helpers instead of direct data writes", () => {
    const setNodeDataRender = vi.fn();
    const execCommand = vi.fn();
    const parentDataNode = {
      data: { uid: "target", text: "old", expand: undefined as boolean | undefined },
      children: [] as Array<{ data: { text: string }; children: unknown[] }>,
    };
    const mindMap = {
      execCommand,
      renderer: {
        findNodeByUid: vi.fn(uid =>
          uid === "target" ? { uid: "target", nodeData: parentDataNode } : null,
        ),
        setNodeDataRender,
        renderTree: {
          data: { uid: "root" },
          children: [parentDataNode],
        },
      },
    };
    const cloneJson = vi.fn(value => JSON.parse(JSON.stringify(value)));
    const ensureAiNodeDataUid = vi.fn(node => node);

    applyAiOrganizeResultToMindMap(
      mindMap,
      "target",
      {
        current: { data: { text: "updated", richText: true } },
        children: [{ data: { text: "child" }, children: [] }],
      },
      { cloneJson, ensureAiNodeDataUid },
    );

    expect(setNodeDataRender).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "target" }),
      { text: "updated", richText: true },
      true,
    );
    expect(execCommand).not.toHaveBeenCalled();
    expect(parentDataNode.children).toHaveLength(1);
    expect(parentDataNode.children[0].data.text).toBe("child");
    expect(parentDataNode.data.expand).toBe(true);
  });

  it("adds children via tree mutation without execCommand", () => {
    const execCommand = vi.fn();
    const markTreeStructureDirty = vi.fn();
    const parentDataNode = {
      data: { uid: "parent", expand: undefined as boolean | undefined },
      children: [] as Array<{ data: { text: string; uid: string }; children: unknown[] }>,
    };
    const mindMap = {
      execCommand,
      renderer: {
        findNodeByUid: vi.fn(() => ({ uid: "parent", nodeData: parentDataNode })),
        markTreeStructureDirty,
        renderTree: null,
      },
    };
    const cloneJson = vi.fn(value => JSON.parse(JSON.stringify(value)));
    const ensureAiNodeDataUid = vi.fn(node => node);

    const result = applyAiAddChild(
      mindMap,
      "parent",
      { data: { text: "child", richText: true }, children: [] },
      { cloneJson, ensureAiNodeDataUid },
    );

    expect(result).toEqual({
      ok: true,
      via: "tree",
      uid: expect.any(String),
    });
    expect(execCommand).not.toHaveBeenCalled();
    expect(markTreeStructureDirty).toHaveBeenCalledWith(
      "parent",
      expect.any(String),
    );
    expect(parentDataNode.children).toHaveLength(1);
    expect(parentDataNode.children[0].data.text).toBe("child");
    expect(parentDataNode.data.expand).toBe(true);
  });

  it("adds children on renderTree when parent has no node instance", () => {
    const mindMap = {
      renderer: {
        findNodeByUid: vi.fn(() => null),
        renderTree: {
          data: { uid: "root" },
          children: [
            {
              data: { uid: "parent" },
              children: [],
            },
          ],
        },
      },
    };
    const cloneJson = vi.fn(value => JSON.parse(JSON.stringify(value)));
    const ensureAiNodeDataUid = vi.fn(node => node);

    const result = applyAiAddChild(
      mindMap,
      "parent",
      { data: { text: "child" }, children: [] },
      { cloneJson, ensureAiNodeDataUid },
    );

    expect(result.ok).toBe(true);
    expect(findAiDataNodeByUid(mindMap, "parent")).not.toBeNull();
    const parent = mindMap.renderer.renderTree.children[0] as {
      data: { expand?: boolean };
      children: Array<{ data: { text: string } }>;
    };
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].data.text).toBe("child");
    expect(parent.data.expand).toBe(true);
  });
});
