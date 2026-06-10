import { describe, expect, it } from "vitest";

import { parseAiOrganizeJson } from "./native/web/src/utils/aiTreeJson";

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

  it("removes leading layout spaces while preserving structural indent", () => {
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
      '<p class="ql-indent-2"><span>Star &nbsp;&amp; Fork</span></p>',
    );
  });
});
