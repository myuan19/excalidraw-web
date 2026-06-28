import { truncStr } from "../logger.js";

import { createLogger } from "./logger.js";
import { buildUpstreamHeaders } from "./aiUpstreamProfiles.js";
import {
  readAISettingsConfig,
  resolveMindMapAIEndpoint,
} from "./aiSettingsConfig.js";

export const AI_PROXY_FEATURE = {
  TEXT_TO_DIAGRAM: "text-to-diagram",
  DIAGRAM_TO_CODE: "diagram-to-code",
  ICON_TAG: "icon-tag",
  MINDMAP_CHAT: "mindmap-chat",
};

const log = createLogger({ module: "ai.proxy" });
const VALID_ROLES = new Set(["system", "user", "assistant"]);
const TTD_TEMPERATURE = 0.2;

export function resolveChatCompletionsUrl(endpoint) {
  const base = String(endpoint || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) {
    return "";
  }
  if (base.includes("/chat/completions")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

export function thinkingDisabledExtras() {
  return {
    thinking: { type: "disabled" },
    enable_thinking: false,
    chat_template_kwargs: { enable_thinking: false },
  };
}

function createStatusError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }
      const role = VALID_ROLES.has(message.role) ? message.role : "user";
      const content =
        typeof message.content === "string" ? message.content : "";
      if (!content.trim()) {
        return null;
      }
      return { role, content };
    })
    .filter(Boolean);
}

function normalizeMessagesWithRichContent(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }
      const role = VALID_ROLES.has(message.role) ? message.role : "user";
      const content = message.content;
      if (typeof content === "string") {
        return content.trim() ? { role, content } : null;
      }
      if (Array.isArray(content) && content.length > 0) {
        return { role, content };
      }
      return null;
    })
    .filter(Boolean);
}

function resolveExcalidrawModel(config, feature) {
  const cfg = config.excalidraw || {};
  const text = String(cfg.textToDiagramModel || "").trim();
  const diagram = String(cfg.diagramToCodeModel || "").trim();
  const icon = String(cfg.iconTagModel || "").trim();
  if (feature === AI_PROXY_FEATURE.TEXT_TO_DIAGRAM) {
    return text || diagram || "gpt-4o";
  }
  if (feature === AI_PROXY_FEATURE.DIAGRAM_TO_CODE) {
    return diagram || text || "gpt-4o";
  }
  if (feature === AI_PROXY_FEATURE.ICON_TAG) {
    return icon || diagram || text || "gpt-4o";
  }
  return text || diagram || icon || "gpt-4o";
}

function resolveFeatureConfig(config, feature) {
  if (feature === AI_PROXY_FEATURE.MINDMAP_CHAT) {
    const cfg = config.mindmap || {};
    if (
      !String(cfg.endpoint || "").trim() ||
      !String(cfg.apiKey || "").trim()
    ) {
      throw createStatusError("mindmap_ai_not_configured", 400);
    }
    return {
      endpoint: cfg.endpoint,
      apiKey: cfg.apiKey,
      model: String(cfg.model || "").trim() || "gpt-4o",
    };
  }

  const cfg = config.excalidraw || {};
  if (!String(cfg.endpoint || "").trim() || !String(cfg.apiKey || "").trim()) {
    throw createStatusError("excalidraw_ai_not_configured", 400);
  }
  return {
    endpoint: cfg.endpoint,
    apiKey: cfg.apiKey,
    model: resolveExcalidrawModel(config, feature),
  };
}

function latestTextPreview(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content;
    if (typeof content === "string") {
      return truncStr(content.replace(/\s+/g, " ").trim(), 240);
    }
  }
  return "";
}

export function buildAIProxyChatRequest(config, body = {}) {
  const feature = body.feature || AI_PROXY_FEATURE.MINDMAP_CHAT;
  const upstream = resolveFeatureConfig(config, feature);
  const endpoint =
    feature === AI_PROXY_FEATURE.MINDMAP_CHAT
      ? resolveMindMapAIEndpoint(upstream.endpoint)
      : resolveChatCompletionsUrl(upstream.endpoint);
  const baseMessages =
    feature === AI_PROXY_FEATURE.MINDMAP_CHAT
      ? normalizeMessages(body.messages)
      : normalizeMessagesWithRichContent(body.messages);

  if (baseMessages.length <= 0) {
    throw createStatusError("messages_required", 400);
  }

  const systemPrompt =
    typeof body.systemPrompt === "string" && body.systemPrompt.trim()
      ? body.systemPrompt
      : "";
  const messages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...baseMessages]
    : baseMessages;
  const stream = body.stream !== false;
  const requestBody = {
    model: upstream.model,
    messages,
    stream,
    ...(typeof body.temperature === "number"
      ? { temperature: body.temperature }
      : {}),
    ...(body.thinkingDisabled === false ? {} : thinkingDisabledExtras()),
  };

  return {
    feature,
    endpoint,
    init: {
      method: "POST",
      headers: {
        ...buildUpstreamHeaders({
          apiKey: upstream.apiKey,
          profile: body.upstreamProfile,
        }),
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(requestBody),
    },
    summary: {
      feature,
      model: upstream.model,
      stream,
      messageCount: baseMessages.length,
      promptPreview: latestTextPreview(baseMessages),
    },
  };
}

export function buildAIProxyVisionRequest(config, body = {}) {
  const feature = body.feature;
  if (
    feature !== AI_PROXY_FEATURE.DIAGRAM_TO_CODE &&
    feature !== AI_PROXY_FEATURE.ICON_TAG
  ) {
    throw createStatusError("unsupported_vision_feature", 400);
  }
  const upstream = resolveFeatureConfig(config, feature);
  const endpoint = resolveChatCompletionsUrl(upstream.endpoint);
  const imageDataUrl =
    typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!imageDataUrl.trim()) {
    throw createStatusError("image_required", 400);
  }

  const messages =
    feature === AI_PROXY_FEATURE.DIAGRAM_TO_CODE
      ? buildDiagramToCodeMessages(body)
      : buildIconTagMessages(imageDataUrl);
  const requestBody = {
    model: upstream.model,
    messages,
    max_tokens: feature === AI_PROXY_FEATURE.ICON_TAG ? 50 : 4096,
    temperature: TTD_TEMPERATURE,
    ...thinkingDisabledExtras(),
  };

  return {
    feature,
    endpoint,
    init: {
      method: "POST",
      headers: buildUpstreamHeaders({
        apiKey: upstream.apiKey,
        profile: body.upstreamProfile,
      }),
      body: JSON.stringify(requestBody),
    },
    summary: {
      feature,
      model: upstream.model,
      imageChars: imageDataUrl.length,
      promptPreview: truncStr(String(body.textContext || ""), 240),
    },
  };
}

function buildDiagramToCodeMessages(body) {
  const imageDataUrl = String(body.imageDataUrl || "");
  const textContext =
    typeof body.textContext === "string" && body.textContext.trim()
      ? body.textContext
      : "Convert this diagram screenshot to clean HTML/CSS.";
  return [
    {
      role: "system",
      content:
        "You convert UI sketches to a single self-contained HTML snippet with inline CSS. Output only the HTML document body content or a full minimal HTML page. No markdown fences.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: textContext },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];
}

function buildIconTagMessages(imageDataUrl) {
  return [
    {
      role: "system",
      content:
        "给定一张图标或图形图片，只输出一个简短的描述性标签（1-4个词）。\n\n规则：\n1. 默认使用中文描述图形的形状或含义，例如：六边形、五角星、圆形箭头、数据库、用户头像、齿轮设置、云服务器\n2. 如果图标是知名的技术品牌/产品Logo（如 React、Docker、Kubernetes、AWS、GitHub 等），则直接使用其英文名称\n3. 不要加标点符号、不要解释、不要输出多余内容，只输出标签本身",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "这是什么图标？只回复一个简短标签。" },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ];
}

export async function fetchUpstream(proxyRequest, signal) {
  log.info("upstream request", {
    endpointTail: proxyRequest.endpoint.slice(-32),
    ...proxyRequest.summary,
  });
  return fetch(proxyRequest.endpoint, {
    ...proxyRequest.init,
    signal,
  });
}

function writeChunk(res, chunk) {
  return new Promise((resolve, reject) => {
    if (res.destroyed) {
      resolve();
      return;
    }
    res.write(Buffer.from(chunk), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function pipeWebStreamToResponse(stream, res) {
  const reader = stream.getReader();
  try {
    while (!res.destroyed) {
      let readResult;
      try {
        readResult = await reader.read();
      } catch (error) {
        if (
          res.destroyed ||
          error?.name === "AbortError" ||
          error?.code === "ERR_INVALID_STATE"
        ) {
          break;
        }
        throw error;
      }
      const { done, value } = readResult;
      if (done) {
        break;
      }
      if (value) {
        await writeChunk(res, value);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Client disconnect may already have closed the upstream body.
    }
    try {
      reader.releaseLock();
    } catch {
      // Ignore double-close races from undici abort.
    }
  }
}

export async function streamProxyResponse(proxyRequest, req, res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  const upstream = await fetchUpstream(proxyRequest, controller.signal);
  if (!upstream.ok) {
    const text = await upstream.text();
    log.warn("upstream error", {
      status: upstream.status,
      body: truncStr(text, 500),
      feature: proxyRequest.feature,
    });
    return res.status(upstream.status).json({
      error: "ai_upstream_error",
      status: upstream.status,
      message: text || `upstream HTTP ${upstream.status}`,
    });
  }
  if (!upstream.body) {
    return res.status(502).json({ error: "ai_empty_stream" });
  }

  res.status(200);
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
  );
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  await pipeWebStreamToResponse(upstream.body, res);
  if (!res.destroyed) {
    res.end();
  }
}

export async function jsonProxyResponse(proxyRequest, req, res) {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  const upstream = await fetchUpstream(proxyRequest, controller.signal);
  const text = await upstream.text();
  if (!upstream.ok) {
    log.warn("upstream json error", {
      status: upstream.status,
      body: truncStr(text, 500),
      feature: proxyRequest.feature,
    });
    return res.status(upstream.status).json({
      error: "ai_upstream_error",
      status: upstream.status,
      message: text || `upstream HTTP ${upstream.status}`,
    });
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return res.status(502).json({ error: "ai_invalid_json_response" });
  }
  return res.json(json);
}

export function readConfigAndBuildChat(db, body) {
  return buildAIProxyChatRequest(readAISettingsConfig(db), body);
}

export function readConfigAndBuildVision(db, body) {
  return buildAIProxyVisionRequest(readAISettingsConfig(db), body);
}
