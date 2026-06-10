import { describe, expect, it } from "vitest";

import {
  getAiOperationKey,
  parseAiOperationStreamChunk,
} from "./native/web/src/utils/aiOperationStream";

describe("parseAiOperationStreamChunk", () => {
  it("parses only complete NDJSON lines during streaming", () => {
    const content =
      '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"A"}]}]}}\n{"op":"add_child"';

    const result = parseAiOperationStreamChunk(content);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      op: "update_current",
      id: "current",
      data: {
        text: "<p><span>A</span></p>",
        richText: true,
      },
    });
    expect(result.offset).toBe(
      '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"A"}]}]}}\n'
        .length,
    );
  });

  it("strips inline styles unless explicitly allowed", () => {
    const line =
      '{"op":"update_current","text":{"paragraphs":[{"align":"center","spans":[{"text":"A","bold":true,"color":"#ff0000"}]}]}}\n';

    const defaultResult = parseAiOperationStreamChunk(line);
    const styledResult = parseAiOperationStreamChunk(line, {
      allowInlineStyles: true,
    });
    const defaultOperation = defaultResult.operations[0] as any;
    const styledOperation = styledResult.operations[0] as any;

    expect(defaultOperation.data.text).toBe("<p><span>A</span></p>");
    expect(styledOperation.data.text).toContain('class="ql-align-center"');
    expect(styledOperation.data.text).toContain("color:#ff0000");
  });

  it("requires add_child operations to include a stable id", () => {
    expect(() =>
      parseAiOperationStreamChunk(
        '{"op":"add_child","text":{"paragraphs":[{"spans":[{"text":"A"}]}]}}\n',
      ),
    ).toThrow(/add_child requires id/);
  });

  it("accepts plain string text payloads", () => {
    const result = parseAiOperationStreamChunk(
      '{"op":"update_current","text":"Plain title"}\n',
    );
    const operation = result.operations[0] as any;

    expect(operation.data.text).toBe("<p><span>Plain title</span></p>");
  });

  it("normalizes AI layout spaces and text entities in streaming operations", () => {
    const result = parseAiOperationStreamChunk(
      '{"op":"update_current","text":{"paragraphs":[{"indent":1,"spans":[{"text":"    Star &amp; Fork"}]}]}}\n',
      {
        allowInlineStyles: true,
      },
    );
    const operation = result.operations[0] as any;

    expect(operation.data.text).toBe(
      '<p class="ql-indent-1"><span>Star &amp; Fork</span></p>',
    );
  });

  it("preserves leading spaces in streaming operations when explicitly enabled", () => {
    const result = parseAiOperationStreamChunk(
      '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"标题","bold":true}]},{"spans":[{"text":"  正文"}]}]}}\n',
      {
        allowInlineStyles: true,
        preserveLeadingSpaces: true,
      },
    );
    const operation = result.operations[0] as any;

    expect(operation.data.text).toBe(
      "<p><strong><span>标题</span></strong></p><p><span>&nbsp;&nbsp;正文</span></p>",
    );
  });

  it("uses add_child id as the idempotency key by default", () => {
    const result = parseAiOperationStreamChunk(
      '{"op":"add_child","id":"ai-1","parent":"current","text":{"paragraphs":[{"spans":[{"text":"A"}]}]}}\n',
    );

    expect(getAiOperationKey(result.operations[0])).toBe("add_child:ai-1");
  });

  it("ignores SSE done markers", () => {
    const result = parseAiOperationStreamChunk(
      'data: {"op":"done"}\ndata: [DONE]\n',
      { final: true },
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].op).toBe("done");
  });
});
