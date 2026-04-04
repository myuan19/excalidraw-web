import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  type AIConfig,
  refetchAIConfig,
  saveAIConfigToServer,
} from "../data/aiConfig";

import "./AISettings.scss";

export type { AIConfig } from "../data/aiConfig";
export {
  resolveAIModels,
  getCachedAIConfig,
  isAIConfigured,
  ensureAIConfigLoaded,
  subscribeAIConfig,
} from "../data/aiConfig";

const DEFAULT_CONFIG: AIConfig = {
  endpoint: "",
  apiKey: "",
  textToDiagramModel: "",
  diagramToCodeModel: "",
  iconTagModel: "",
};

interface AISettingsProps {
  open: boolean;
  onClose: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({ open, onClose }) => {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mouseDownInsideRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoadError(null);
    let cancelled = false;
    (async () => {
      try {
        const cfg = await refetchAIConfig();
        if (!cancelled) {
          setConfig(cfg);
        }
      } catch (e: unknown) {
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
      await saveAIConfigToServer(config);
      onClose();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="ai-settings-overlay"
      onMouseDown={() => {
        mouseDownInsideRef.current = false;
      }}
      onMouseUp={() => {
        if (!mouseDownInsideRef.current) {
          onClose();
        }
      }}
    >
      <div
        className="ai-settings-dialog"
        onMouseDown={(e) => {
          e.stopPropagation();
          mouseDownInsideRef.current = true;
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
        }}
      >
        <h2>AI 配置</h2>
        <p className="ai-settings-desc">
          配置 OpenAI 兼容 API。设置保存在<strong>服务器</strong>（SQLite），同一部署下所有浏览器共享；请求仍由本机浏览器直连你所填的
          Base URL。
        </p>
        <p className="ai-settings-desc">
          文本生成图与图转代码可分别指定模型；只填其一则另一项自动沿用。
        </p>

        {loadError ? (
          <p className="ai-settings-desc" style={{ color: "#c92a2a" }}>
            {loadError}
          </p>
        ) : null}

        <label>
          Base URL（API 根地址）
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={config.endpoint}
            onChange={(e) =>
              setConfig((c) => ({ ...c, endpoint: e.target.value }))
            }
          />
        </label>

        <label>
          API Key（密钥）
          <input
            type="password"
            placeholder="sk-…"
            value={config.apiKey}
            onChange={(e) =>
              setConfig((c) => ({ ...c, apiKey: e.target.value }))
            }
          />
        </label>

        <label>
          文本生成图模型（Text-to-Diagram / Mermaid）
          <input
            type="text"
            placeholder="gpt-4o-mini 或 deepseek-chat 等"
            value={config.textToDiagramModel}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                textToDiagramModel: e.target.value,
              }))
            }
          />
        </label>

        <label>
          图转代码模型（Diagram-to-Code，需 VLM）
          <input
            type="text"
            placeholder="gpt-4o、qwen-vl 等支持图像的模型"
            value={config.diagramToCodeModel}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                diagramToCodeModel: e.target.value,
              }))
            }
          />
        </label>

        <label>
          图标打标签模型（Icon Tagging，需 VLM）
          <input
            type="text"
            placeholder="gpt-4o-mini 等支持图像的模型"
            value={config.iconTagModel}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                iconTagModel: e.target.value,
              }))
            }
          />
        </label>

        <div className="ai-settings-buttons">
          <button className="ai-btn-secondary" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="ai-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};
