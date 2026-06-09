import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useStrictOverlayDismiss } from "../hooks/useStrictOverlayDismiss";

import {
  type AISettingsConfig,
  DEFAULT_EXCALIDRAW_AI_CONFIG,
  DEFAULT_MINDMAP_AI_CONFIG,
  refetchAIConfig,
  saveAIConfigToServer,
} from "../data/aiConfig";
import {
  AUTO_SAVE_IDLE_SEC_OPTIONS,
  type AppSettings,
  getAppSettings,
  updateAppSettings,
  subscribeAppSettings,
} from "../data/appSettings";

import "./SettingsPanel.scss";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_AI_CONFIG: AISettingsConfig = {
  excalidraw: DEFAULT_EXCALIDRAW_AI_CONFIG,
  mindmap: DEFAULT_MINDMAP_AI_CONFIG,
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  onClose,
}) => {
  const [aiConfig, setAiConfig] = useState<AISettingsConfig>(DEFAULT_AI_CONFIG);
  const [appSettings, setAppSettings] = useState<AppSettings>(getAppSettings);
  const [showExcalidrawKey, setShowExcalidrawKey] = useState(false);
  const [showMindMapKey, setShowMindMapKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "ai">("general");

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
          setAiConfig(cfg);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    setAppSettings(getAppSettings());
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return subscribeAppSettings(() => {
      setAppSettings(getAppSettings());
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSaveAI = useCallback(async () => {
    setLoadError(null);
    setSaving(true);
    try {
      await saveAIConfigToServer(aiConfig);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [aiConfig]);

  const handleAppSettingChange = useCallback(
    (key: keyof AppSettings, value: boolean | number) => {
      updateAppSettings({ [key]: value });
    },
    [],
  );

  const overlayDismiss = useStrictOverlayDismiss(onClose);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="settings-panel-overlay" role="presentation">
      <div
        className="settings-panel-overlay__backdrop"
        aria-hidden
        {...overlayDismiss}
      />
      <div
        className="settings-panel"
        role="dialog"
        aria-modal
        aria-label="设置"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="settings-panel__header">
          <h2>设置</h2>
          <button
            type="button"
            className="settings-panel__close"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>

        <nav className="settings-panel__tabs">
          <button
            type="button"
            className={`settings-panel__tab ${activeTab === "general" ? "settings-panel__tab--active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            常规
          </button>
          <button
            type="button"
            className={`settings-panel__tab ${activeTab === "ai" ? "settings-panel__tab--active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            AI 配置
          </button>
        </nav>

        <div className="settings-panel__body">
          {activeTab === "general" && (
            <div className="settings-panel__section">
              <h3>自动保存</h3>
              <div className="settings-panel__option">
                <div className="settings-panel__option-text">
                  <span className="settings-panel__option-label">
                    切换后台时自动保存
                  </span>
                  <span className="settings-panel__option-desc">
                    当页面切换到后台或失去焦点时，自动将当前编辑内容保存到服务器（仅对已入库文件生效）
                  </span>
                </div>
                <label className="settings-panel__toggle">
                  <input
                    type="checkbox"
                    checked={appSettings.autoSaveOnBlur}
                    onChange={(e) =>
                      handleAppSettingChange("autoSaveOnBlur", e.target.checked)
                    }
                  />
                  <span className="settings-panel__toggle-track" />
                </label>
              </div>
              <div className="settings-panel__option">
                <div className="settings-panel__option-text">
                  <span className="settings-panel__option-label">
                    空闲自动保存
                  </span>
                  <span className="settings-panel__option-desc">
                    停止编辑一段时间后自动保存到服务器，同一次打开期间会覆盖上一次自动存档（仅对已入库文件生效）
                  </span>
                </div>
                <label className="settings-panel__toggle">
                  <input
                    type="checkbox"
                    checked={appSettings.autoSaveEnabled}
                    onChange={(e) =>
                      handleAppSettingChange(
                        "autoSaveEnabled",
                        e.target.checked,
                      )
                    }
                  />
                  <span className="settings-panel__toggle-track" />
                </label>
              </div>
              {appSettings.autoSaveEnabled && (
                <>
                  <div className="settings-panel__option settings-panel__option--sub">
                    <div className="settings-panel__option-text">
                      <span className="settings-panel__option-label">
                        空闲等待时间
                      </span>
                      <span className="settings-panel__option-desc">
                        停止编辑后等待多久触发保存
                      </span>
                    </div>
                    <select
                      className="settings-panel__select"
                      value={appSettings.autoSaveIdleSec}
                      onChange={(e) => {
                        handleAppSettingChange(
                          "autoSaveIdleSec",
                          Number(e.target.value),
                        );
                        e.currentTarget.blur();
                      }}
                    >
                      {AUTO_SAVE_IDLE_SEC_OPTIONS.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec < 60
                            ? `${sec} 秒`
                            : sec === 60
                              ? "1 分钟"
                              : sec === 120
                                ? "2 分钟"
                                : sec === 300
                                  ? "5 分钟"
                                  : `${sec / 60} 分钟`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="settings-panel__option settings-panel__option--sub">
                    <div className="settings-panel__option-text">
                      <span className="settings-panel__option-label">
                        离开自动保存
                      </span>
                      <span className="settings-panel__option-desc">
                        切换文件、返回列表或最近访问时，若有未保存更改则自动保存后再离开（仅对已入库文件生效）
                      </span>
                    </div>
                    <label className="settings-panel__toggle">
                      <input
                        type="checkbox"
                        checked={appSettings.autoSaveOnExit}
                        onChange={(e) =>
                          handleAppSettingChange(
                            "autoSaveOnExit",
                            e.target.checked,
                          )
                        }
                      />
                      <span className="settings-panel__toggle-track" />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "ai" && (
            <>
              {loadError ? (
                <p className="settings-panel__error">{loadError}</p>
              ) : null}

              <div className="settings-panel__section">
                <h3>Excalidraw AI</h3>
                <p className="settings-panel__section-desc">
                  用于文本生成图、图转代码和素材图标打标签。
                </p>
                <label>
                  Base URL（API 根地址）
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={aiConfig.excalidraw.endpoint}
                    onChange={(e) =>
                      setAiConfig((c) => ({
                        ...c,
                        excalidraw: {
                          ...c.excalidraw,
                          endpoint: e.target.value,
                        },
                      }))
                    }
                  />
                </label>

                <label>
                  API Key（密钥）
                  <span className="settings-panel__secret">
                    <input
                      type={showExcalidrawKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={aiConfig.excalidraw.apiKey}
                      onChange={(e) =>
                        setAiConfig((c) => ({
                          ...c,
                          excalidraw: {
                            ...c.excalidraw,
                            apiKey: e.target.value,
                          },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="settings-panel__secret-toggle"
                      onClick={() => setShowExcalidrawKey((v) => !v)}
                    >
                      {showExcalidrawKey ? "隐藏" : "查看"}
                    </button>
                  </span>
                </label>

                <label>
                  文本生成图模型
                  <input
                    type="text"
                    placeholder="gpt-4o-mini 或 deepseek-chat 等"
                    value={aiConfig.excalidraw.textToDiagramModel}
                    onChange={(e) =>
                      setAiConfig((c) => ({
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
                  图转代码模型（需 VLM）
                  <input
                    type="text"
                    placeholder="gpt-4o、qwen-vl 等"
                    value={aiConfig.excalidraw.diagramToCodeModel}
                    onChange={(e) =>
                      setAiConfig((c) => ({
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
                  图标打标签模型（需 VLM）
                  <input
                    type="text"
                    placeholder="gpt-4o-mini 等"
                    value={aiConfig.excalidraw.iconTagModel}
                    onChange={(e) =>
                      setAiConfig((c) => ({
                        ...c,
                        excalidraw: {
                          ...c.excalidraw,
                          iconTagModel: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="settings-panel__section">
                <h3>MindMap AI</h3>
                <p className="settings-panel__section-desc">
                  用于 MindMap 内的 AI 生成，独立于 Excalidraw 配置。
                </p>
                <label>
                  Base URL（API 根地址）
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={aiConfig.mindmap.endpoint}
                    onChange={(e) =>
                      setAiConfig((c) => ({
                        ...c,
                        mindmap: {
                          ...c.mindmap,
                          endpoint: e.target.value,
                        },
                      }))
                    }
                  />
                </label>

                <label>
                  API Key（密钥）
                  <span className="settings-panel__secret">
                    <input
                      type={showMindMapKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={aiConfig.mindmap.apiKey}
                      onChange={(e) =>
                        setAiConfig((c) => ({
                          ...c,
                          mindmap: {
                            ...c.mindmap,
                            apiKey: e.target.value,
                          },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="settings-panel__secret-toggle"
                      onClick={() => setShowMindMapKey((v) => !v)}
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
                    value={aiConfig.mindmap.model}
                    onChange={(e) =>
                      setAiConfig((c) => ({
                        ...c,
                        mindmap: { ...c.mindmap, model: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="settings-panel__ai-actions">
                <button
                  className="settings-panel__btn-primary"
                  onClick={handleSaveAI}
                  disabled={saving}
                >
                  {saving ? "保存中…" : "保存 AI 配置"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
