import { describe, expect, it } from "vitest";

import {
  parseAiFinalOrganizeResult,
  parseAiOrganizeJson,
} from "./native/web/src/utils/aiTreeJson";

const styledAiResponse = JSON.stringify({
  current: {
    paragraphs: [
      {
        align: "center",
        spans: [
          {
            text: "整理后的内容",
            bold: true,
            color: "#ff0000",
            background: "#fff3bf",
            font: "Microsoft YaHei",
            size: "18px",
          },
        ],
      },
    ],
  },
});

describe("parseAiOrganizeJson", () => {
  it("strips AI inline styles by default so the current theme style applies", () => {
    const result = parseAiOrganizeJson(styledAiResponse);

    expect(result.current.data.text).toBe("<p><span>整理后的内容</span></p>");
  });

  it("keeps inline styles only when explicitly allowed", () => {
    const result = parseAiOrganizeJson(styledAiResponse, {
      allowInlineStyles: true,
    });

    expect(result.current.data.text).toContain('class="ql-align-center"');
    expect(result.current.data.text).toContain("<strong>");
    expect(result.current.data.text).toContain("color:#ff0000");
    expect(result.current.data.text).toContain("background-color:#fff3bf");
    expect(result.current.data.text).toContain("font-size:18px");
  });

  it("normalizes AI text entities without double escaping them", () => {
    const result = parseAiOrganizeJson(
      JSON.stringify({
        current: {
          paragraphs: [
            {
              spans: [
                {
                  text: "Star &amp; Fork &quot;Repo&#39;s&quot;",
                },
              ],
            },
          ],
        },
      }),
    );

    expect(result.current.data.text).toBe(
      "<p><span>Star &amp; Fork &quot;Repo&#39;s&quot;</span></p>",
    );
    expect(result.current.data.text).not.toContain("&amp;amp;");
  });

  it("preserves span leading spaces while keeping structural indent", () => {
    const result = parseAiOrganizeJson(
      JSON.stringify({
        current: {
          paragraphs: [
            {
              indent: 2,
              spans: [
                {
                  text: "    Star  &amp; Fork",
                },
              ],
            },
          ],
        },
      }),
      {
        allowInlineStyles: true,
      },
    );

    expect(result.current.data.text).toBe(
      '<p class="ql-indent-2"><span>&nbsp;&nbsp;&nbsp;&nbsp;Star &nbsp;&amp; Fork</span></p>',
    );
  });

  it("preserves AI span leading spaces in rich text output", () => {
    const result = parseAiOrganizeJson(
      JSON.stringify({
        current: {
          paragraphs: [
            {
              spans: [
                {
                  text: "标题",
                  bold: true,
                },
              ],
            },
            {
              spans: [
                {
                  text: "  正文",
                },
              ],
            },
          ],
        },
      }),
      {
        allowInlineStyles: true,
      },
    );

    expect(result.current.data.text).toBe(
      "<p><strong><span>标题</span></strong></p><p><span>&nbsp;&nbsp;正文</span></p>",
    );
  });

  it("adapts simpleMindMap clipboard JSON into the final current result", () => {
    const result = parseAiFinalOrganizeResult(
      JSON.stringify({
        simpleMindMap: true,
        data: [
          {
            data: {
              text: "<p><strong><span>标题</span></strong></p><p><span>正文</span></p>",
              richText: true,
              note: "备注",
              hyperlink: "https://example.com",
              isActive: true,
              expand: true,
              customTextWidth: 525,
              paddingX: 15,
              paddingY: 0,
            },
            children: [],
          },
        ],
      }),
      {
        allowInlineStyles: true,
      },
    );

    expect(result.current.data).toEqual({
      text: "<p><strong><span>标题</span></strong></p><p><span>正文</span></p>",
      richText: true,
      note: "备注",
      hyperlink: "https://example.com",
    });
  });

  it("does not apply simpleMindMap children without child permissions", () => {
    const result = parseAiFinalOrganizeResult(
      JSON.stringify({
        simpleMindMap: true,
        data: [
          {
            data: {
              text: "<p><span>当前</span></p>",
              richText: true,
            },
            children: [
              {
                data: {
                  text: "<p><span>子节点</span></p>",
                  richText: true,
                },
                children: [],
              },
            ],
          },
        ],
      }),
    );

    expect(result.current.data.text).toBe("<p><span>当前</span></p>");
    expect(result.children).toEqual([]);
  });

  it("converts simpleMindMap children only when child creation is allowed", () => {
    const result = parseAiFinalOrganizeResult(
      JSON.stringify({
        simpleMindMap: true,
        data: [
          {
            data: {
              text: "<p><span>当前</span></p>",
              richText: true,
            },
            children: [
              {
                data: {
                  text: "<p><span>子节点</span></p>",
                  richText: true,
                },
                children: [],
              },
            ],
          },
          {
            data: {
              text: "额外顶层",
              richText: false,
            },
            children: [],
          },
        ],
      }),
      {
        allowChildren: true,
      },
    );

    expect(
      result.children.map((child: { data: { text: string } }) => child.data.text),
    ).toEqual([
      "<p><span>子节点</span></p>",
      "<p><span>额外顶层</span></p>",
    ]);
  });
});
