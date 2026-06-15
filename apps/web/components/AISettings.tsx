import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AISettingsConfig,
  DEFAULT_EXCALIDRAW_AI_CONFIG,
  DEFAULT_MINDMAP_AI_CONFIG,
  refetchAIConfig,
  saveAIConfigToServer,
} from "../data/aiConfig";
import { devDebug } from "../lib/devDebug";

import "./AISettings.scss";

export type { AIConfig } from "../data/aiConfig";
export {
  resolveAIModels,
  getCachedAIConfig,
  isAIConfigured,
  ensureAIConfigLoaded,
  subscribeAIConfig,
} from "../data/aiConfig";

/** 仅在按下与松手都点在遮罩上时关闭，避免选区/复制时松手在外侧误关。 */
function useStrictOverlayDismiss(onDismiss: () => void) {
  const pointerDownOnBackdrop = useRef(false);
  return useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current) {
          onDismiss();
        }
        pointerDownOnBackdrop.current = false;
      },
      onPointerCancel: () => {
        pointerDownOnBackdrop.current = false;
      },
    }),
    [onDismiss],
  );
}

const DEFAULT_CONFIG: AISettingsConfig = {
  excalidraw: DEFAULT_EXCALIDRAW_AI_CONFIG,
  mindmap: DEFAULT_MINDMAP_AI_CONFIG,
};

function summarizeAISettingsConfig(config: AISettingsConfig) {
  return {
    excalidraw: {
      hasEndpoint: !!config.excalidraw.endpoint.trim(),
      endpointLen: config.excalidraw.endpoint.length,
      endpointTail: config.excalidraw.endpoint.slice(-32),
      hasApiKey: !!config.excalidraw.apiKey.trim(),
      apiKeyLen: config.excalidraw.apiKey.length,
    },
    mindmap: {
      hasEndpoint: !!config.mindmap.endpoint.trim(),
      endpointLen: config.mindmap.endpoint.length,
      endpointTail: config.mindmap.endpoint.slice(-32),
      hasApiKey: !!config.mindmap.apiKey.trim(),
      apiKeyLen: config.mindmap.apiKey.length,
      hasModel: !!config.mindmap.model.trim(),
      model: config.mindmap.model,
      configured: !!(
        config.mindmap.endpoint.trim() && config.mindmap.apiKey.trim()
      ),
    },
  };
}

interface AISettingsProps {
  open: boolean;
  onClose: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ open, onClose }) => {
  const [config, setConfig] = useState<AISettingsConfig>(DEFAULT_CONFIG);
  const [showExcalidrawKey, setShowExcalidrawKey] = useState(false);
  const [showMindMapKey, setShowMindMapKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const overlayDismiss = useStrictOverlayDismiss(onClose);

  useEffect(() => {
    devDebug("ai-config", "AISettings open changed", { open });
    if (!open) {
      return;
    }
    setLoadError(null);
    let cancelled = false;
    (async () => {
      try {
        devDebug("ai-config", "AISettings refetch start");
        const cfg = await refetchAIConfig();
        devDebug("ai-config", "AISettings refetch success", {
          cancelled,
          ...summarizeAISettingsConfig(cfg),
        });
        if (!cancelled) {
          setConfig(cfg);
        }
      } catch (e: unknown) {
        devDebug("ai-config", "AISettings refetch failed", {
          cancelled,
          message: e instanceof Error ? e.message : String(e),
        });
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = useCallback(async () => {
    setLoadError(null);
    setSaving(true);
    try {
      devDebug("ai-config", "AISettings save start", {
        ...summarizeAISettingsConfig(config),
      });
      await saveAIConfigToServer(config);
      devDebug("ai-config", "AISettings save success", {
        ...summarizeAISettingsConfig(config),
      });
      onClose();
    } catch (e: unknown) {
      devDebug("ai-config", "AISettings save failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ai-settings-overlay" {...overlayDismiss}>
      <div
        className="ai-settings-dialog"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2>AI 配置</h2>
        <p className="ai-settings-desc">
          分别配置 Excalidraw 与 MindMap 的 OpenAI 兼容 API。设置保存在
          <strong>服务器</strong>（SQLite），同一部署下所有浏览器共享；所有 AI
          请求均由服务器代理，避免浏览器 CORS，并避免 API Key 进入编辑器运行时。
        </p>

        {loadError ? (
          <p className="ai-settings-desc ai-settings-desc--error">
            {loadError}
          </p>
        ) : null}

        <section className="ai-settings-section">
          <h3>Excalidraw AI</h3>
          <p className="ai-settings-section-desc">
            用于文本生成图、图转代码和素材图标打标签；请求由服务器代理到该 Base
            URL。
          </p>
          <label>
            Base URL（API 根地址）
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={config.excalidraw.endpoint}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  excalidraw: { ...c.excalidraw, endpoint: e.target.value },
                }))
              }
            />
          </label>

          <label>
            API Key（密钥）
            <span className="ai-settings-secret">
              <input
                type={showExcalidrawKey ? "text" : "password"}
                placeholder="sk-..."
                value={config.excalidraw.apiKey}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    excalidraw: { ...c.excalidraw, apiKey: e.target.value },
                  }))
                }
              />
              <button
                type="button"
                className="ai-settings-secret-toggle"
                onClick={() => setShowExcalidrawKey((v) => !v)}
                aria-label={
                  showExcalidrawKey
                    ? "隐藏 Excalidraw API Key"
                    : "显示 Excalidraw API Key"
                }
              >
                {showExcalidrawKey ? "隐藏" : "查看"}
              </button>
            </span>
          </label>

          <label>
            文本生成图模型（Text-to-Diagram / Mermaid）
            <input
              type="text"
              placeholder="gpt-4o-mini 或 deepseek-chat 等"
              value={config.excalidraw.textToDiagramModel}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  excalidraw: {
                    ...c.excalidraw,
                    textToDiagramModel: e.target.value,
                  },
                }))
              }
            />
          </label>

          <label>
            图转代码模型（Diagram-to-Code，需 VLM）
            <input
              type="text"
              placeholder="gpt-4o、qwen-vl 等支持图像的模型"
              value={config.excalidraw.diagramToCodeModel}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  excalidraw: {
                    ...c.excalidraw,
                    diagramToCodeModel: e.target.value,
                  },
                }))
              }
            />
          </label>

          <label>
            图标打标签模型（Icon Tagging，需 VLM）
            <input
              type="text"
              placeholder="gpt-4o-mini 等支持图像的模型"
              value={config.excalidraw.iconTagModel}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  excalidraw: {
                    ...c.excalidraw,
                    iconTagModel: e.target.value,
                  },
                }))
              }
            />
          </label>
        </section>

        <section className="ai-settings-section">
          <h3>MindMap AI</h3>
          <p className="ai-settings-section-desc">
            用于 MindMap 内的 AI 生成，独立于 Excalidraw
            配置；请求由服务器代理到该 Base URL。
          </p>
          <label>
            Base URL（API 根地址）
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={config.mindmap.endpoint}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  mindmap: { ...c.mindmap, endpoint: e.target.value },
                }))
              }
            />
          </label>

          <label>
            API Key（密钥）
            <span className="ai-settings-secret">
              <input
                type={showMindMapKey ? "text" : "password"}
                placeholder="sk-..."
                value={config.mindmap.apiKey}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    mindmap: { ...c.mindmap, apiKey: e.target.value },
                  }))
                }
              />
              <button
                type="button"
                className="ai-settings-secret-toggle"
                onClick={() => setShowMindMapKey((v) => !v)}
                aria-label={
                  showMindMapKey
                    ? "隐藏 MindMap API Key"
                    : "显示 MindMap API Key"
                }
              >
                {showMindMapKey ? "隐藏" : "查看"}
              </button>
            </span>
          </label>

          <label>
            生成模型
            <input
              type="text"
              placeholder="gpt-4o-mini 或 deepseek-chat 等"
              value={config.mindmap.model}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  mindmap: { ...c.mindmap, model: e.target.value },
                }))
              }
            />
          </label>
        </section>

        <div className="ai-settings-buttons">
          <button
            className="ai-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            className="ai-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};
