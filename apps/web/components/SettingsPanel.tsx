import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useDrawerTransition } from "../hooks/useDrawerTransition";
import { useStrictOverlayDismiss } from "../hooks/useStrictOverlayDismiss";
import {
  shellThemeClassName,
  useLiveShellTheme,
} from "../hooks/useShellTheme";
import "./fileListDialogHost.scss";

import {
  type AISettingsConfig,
  DEFAULT_EXCALIDRAW_AI_CONFIG,
  DEFAULT_MINDMAP_AI_CONFIG,
  refetchAIConfig,
  saveAIConfigToServer,
} from "../data/aiConfig";
import {
  AUTO_SAVE_IDLE_SEC_OPTIONS,
  CHECKPOINT_INTERVAL_MIN_OPTIONS,
  type AppSettings,
  getAppSettings,
  updateAppSettings,
  subscribeAppSettings,
} from "../data/appSettings";
import {
  getDebugCapability,
  loadDebugCapability,
  subscribeDebugCapability,
} from "../data/debugCapability";
import { apiTransport } from "../data/apiTransport";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import { resolveDefaultDataDirectoryPath } from "../data/mappedFolderClient";

import "./SettingsPanel.scss";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsPathAction = {
  label: string;
  onClick: () => void;
  variant?: "accent" | "neutral";
};

function SettingsPathSetting({
  label,
  description,
  path,
  pathTitle,
  status,
  actions,
}: {
  label: string;
  description: string;
  path: string;
  pathTitle?: string;
  status: string | null;
  actions: SettingsPathAction[];
}) {
  return (
    <div className="settings-panel__option settings-panel__option--path-setting">
      <div className="settings-panel__option-text">
        <span className="settings-panel__option-label">{label}</span>
        <span className="settings-panel__option-desc">{description}</span>
      </div>
      <div className="settings-panel__path-block">
        <span className="settings-panel__path" title={pathTitle ?? path}>
          {path}
        </span>
        {actions.length > 0 ? (
          <div className="settings-panel__path-toolbar">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={[
                  "settings-panel__path-btn",
                  action.variant === "neutral"
                    ? "settings-panel__path-btn--neutral"
                    : "settings-panel__path-btn--accent",
                ].join(" ")}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {status ? (
        <span className="settings-panel__option-desc settings-panel__option-desc--status">
          {status}
        </span>
      ) : null}
    </div>
  );
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
  const [openLogsStatus, setOpenLogsStatus] = useState<string | null>(null);
  const [defaultDataDirectoryStatus, setDefaultDataDirectoryStatus] = useState<
    string | null
  >(null);
  const [appDataDirectoryPath, setAppDataDirectoryPath] = useState<
    string | null
  >(null);
  const [appDataDirectoryStatus, setAppDataDirectoryStatus] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "general" | "preferences" | "ai"
  >("general");
  const [debugCapability, setDebugCapability] = useState(getDebugCapability);
  const shellTheme = useLiveShellTheme();
  const { mounted, active, onDrawerTransitionEnd } = useDrawerTransition(open);
  const isDesktop = isDesktopEditorHub();
  const showCheckpointSettings = !isDesktop;
  const showDebugLoggingControl = debugCapability.allowed;

  useEffect(() => {
    if (!mounted) {
      return;
    }
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
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !isDesktop) {
      return;
    }
    let cancelled = false;
    void window.editorHubDesktop?.getAppDataDirectoryPath?.().then((resolved) => {
      if (!cancelled && resolved?.trim()) {
        setAppDataDirectoryPath(resolved.trim());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, isDesktop]);

  useEffect(() => {
    return subscribeAppSettings(() => {
      setAppSettings(getAppSettings());
    });
  }, []);

  useEffect(() => {
    void loadDebugCapability();
    return subscribeDebugCapability(() => {
      setDebugCapability(getDebugCapability());
    });
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

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
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      updateAppSettings({ [key]: value } as Pick<AppSettings, K>);
    },
    [],
  );

  const handleOpenLogs = useCallback(async () => {
    setOpenLogsStatus(null);
    try {
      if (isDesktopEditorHub()) {
        const response = await apiTransport.request({
          method: "POST",
          path: "/api/logs/open",
          headers: { Accept: "application/json" },
        });
        if (response.status < 200 || response.status >= 300) {
          let message = `打开日志失败 (${response.status})`;
          try {
            const body = JSON.parse(response.bodyText) as { error?: string };
            if (body?.error) {
              message = body.error;
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }
        return;
      }
      const base = (import.meta.env.VITE_APP_API_BASE ?? "").replace(/\/$/, "");
      const response = await fetch(`${base}/api/logs/open`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `打开日志失败 (${response.status})`);
      }
    } catch (error) {
      setOpenLogsStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleOpenAppDataDirectory = useCallback(async () => {
    setAppDataDirectoryStatus(null);
    try {
      const absPath =
        appDataDirectoryPath ??
        (await window.editorHubDesktop?.getAppDataDirectoryPath?.());
      if (!absPath?.trim()) {
        throw new Error("无法获取应用数据目录");
      }
      const result = await window.editorHubDesktop?.openPath?.(absPath.trim());
      if (result && result !== "") {
        throw new Error(result);
      }
      setAppDataDirectoryStatus("已在文件管理器中打开");
    } catch (error) {
      setAppDataDirectoryStatus(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [appDataDirectoryPath]);

  const handleChooseDefaultDataDirectory = useCallback(async () => {
    setDefaultDataDirectoryStatus(null);
    try {
      const picked = await window.editorHubDesktop?.pickFolder?.();
      if (!picked) {
        return;
      }
      handleAppSettingChange("defaultDataDirectoryPath", picked);
      setDefaultDataDirectoryStatus("已更新默认保存目录");
    } catch (error) {
      setDefaultDataDirectoryStatus(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [handleAppSettingChange]);

  const handleOpenDefaultDataDirectory = useCallback(async () => {
    setDefaultDataDirectoryStatus(null);
    try {
      const absPath = await resolveDefaultDataDirectoryPath();
      const result = await window.editorHubDesktop?.openPath?.(absPath);
      if (result && result !== "") {
        throw new Error(result);
      }
      setDefaultDataDirectoryStatus("已在文件管理器中打开");
    } catch (error) {
      setDefaultDataDirectoryStatus(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const overlayDismiss = useStrictOverlayDismiss(onClose);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className={[
        "settings-panel-overlay",
        "filelist-dialog-host",
        shellThemeClassName(shellTheme),
        active ? "settings-panel-overlay--active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="presentation"
    >
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
        aria-hidden={!active}
        onPointerDown={(e) => e.stopPropagation()}
        onTransitionEnd={onDrawerTransitionEnd}
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
            className={`settings-panel__tab ${
              activeTab === "general" ? "settings-panel__tab--active" : ""
            }`}
            onClick={() => setActiveTab("general")}
          >
            常规
          </button>
          <button
            type="button"
            className={`settings-panel__tab ${
              activeTab === "preferences" ? "settings-panel__tab--active" : ""
            }`}
            onClick={() => setActiveTab("preferences")}
          >
            用户偏好
          </button>
          <button
            type="button"
            className={`settings-panel__tab ${
              activeTab === "ai" ? "settings-panel__tab--active" : ""
            }`}
            onClick={() => setActiveTab("ai")}
          >
            AI 配置
          </button>
        </nav>

        <div className="settings-panel__body">
          {activeTab === "preferences" && (
            <div className="settings-panel__section">
              <h3>界面</h3>
              <div className="settings-panel__option">
                <div className="settings-panel__option-text">
                  <span className="settings-panel__option-label">
                    界面浮出动画
                  </span>
                  <span className="settings-panel__option-desc">
                    开启后，切换文件夹或视图时卡片由下而上逐个浮现；关闭则直接显示。
                  </span>
                </div>
                <label className="settings-panel__toggle">
                  <input
                    type="checkbox"
                    checked={appSettings.interfaceRevealAnimationEnabled}
                    onChange={(e) =>
                      handleAppSettingChange(
                        "interfaceRevealAnimationEnabled",
                        e.target.checked,
                      )
                    }
                  />
                  <span className="settings-panel__toggle-track" />
                </label>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <>
              <div className="settings-panel__section">
                <h3>自动保存</h3>
                <div className="settings-panel__option">
                  <div className="settings-panel__option-text">
                    <span className="settings-panel__option-label">
                      自动保存
                    </span>
                    <span className="settings-panel__option-desc">
                      开启后离开编辑器时自动保存并退出，无需手动确认。
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
                  <div className="settings-panel__option settings-panel__option--sub">
                    <div className="settings-panel__option-text">
                      <span className="settings-panel__option-label">
                        空闲等待时间
                      </span>
                      <span className="settings-panel__option-desc">
                        停止编辑后自动触发保存（需先开启自动保存）。
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
                          {sec === 0
                            ? "不触发"
                            : sec < 60
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
                )}
                {showCheckpointSettings && (
                  <div className="settings-panel__option">
                    <div className="settings-panel__option-text">
                      <span className="settings-panel__option-label">
                        checkpoint 间隔
                      </span>
                      <span className="settings-panel__option-desc">
                        每次保存到 latest 时检查；距离上次 checkpoint
                        超过该间隔才创建新 checkpoint
                      </span>
                    </div>
                    <select
                      className="settings-panel__select"
                      value={appSettings.checkpointIntervalMin}
                      onChange={(e) => {
                        handleAppSettingChange(
                          "checkpointIntervalMin",
                          Number(e.target.value),
                        );
                        e.currentTarget.blur();
                      }}
                    >
                      {CHECKPOINT_INTERVAL_MIN_OPTIONS.map((min) => (
                        <option key={min} value={min}>
                          {min < 60
                            ? `${min} 分钟`
                            : min === 60
                            ? "1 小时"
                            : `${min / 60} 小时`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {isDesktop ? (
                <div className="settings-panel__section">
                  <h3>存储位置</h3>
                  <SettingsPathSetting
                    label="应用数据目录"
                    description="AI 配置、素材库、聊天历史、目录映射索引等（data、catalog 子文件夹）。缓存与日志在本机 Local/Logs 目录，不随 Roaming 同步。"
                    path={appDataDirectoryPath ?? "加载中…"}
                    pathTitle={appDataDirectoryPath ?? undefined}
                    status={appDataDirectoryStatus}
                    actions={[
                      {
                        label: "打开",
                        onClick: () => void handleOpenAppDataDirectory(),
                        variant: "accent",
                      },
                    ]}
                  />
                  <SettingsPathSetting
                    label="默认保存目录"
                    description="在「本地目录」根视图新建或导入内容时，默认保存到这个文件夹（你的 .excalidraw / .smm 文件）"
                    path={appSettings.defaultDataDirectoryPath}
                    pathTitle={appSettings.defaultDataDirectoryPath}
                    status={defaultDataDirectoryStatus}
                    actions={[
                      {
                        label: "打开",
                        onClick: () => void handleOpenDefaultDataDirectory(),
                        variant: "accent",
                      },
                      {
                        label: "更改",
                        onClick: () => void handleChooseDefaultDataDirectory(),
                        variant: "neutral",
                      },
                    ]}
                  />
                </div>
              ) : null}
              <div className="settings-panel__section">
                <h3>日志</h3>
                {showDebugLoggingControl ? (
                  <div className="settings-panel__option">
                    <div className="settings-panel__option-text">
                      <span className="settings-panel__option-label">
                        调试日志
                      </span>
                      <span className="settings-panel__option-desc">
                        记录操作、保存和缓存诊断
                      </span>
                    </div>
                    <label className="settings-panel__toggle">
                      <input
                        type="checkbox"
                        checked={appSettings.debugLoggingMode !== "off"}
                        onChange={(e) =>
                          handleAppSettingChange(
                            "debugLoggingMode",
                            (e.target.checked
                              ? "basic"
                              : "off") as AppSettings["debugLoggingMode"],
                          )
                        }
                      />
                      <span className="settings-panel__toggle-track" />
                    </label>
                  </div>
                ) : null}
                <div className="settings-panel__option">
                  <div className="settings-panel__option-text">
                    <span className="settings-panel__option-label">
                      打开日志
                    </span>
                    <span className="settings-panel__option-desc">
                      打开本次启动日志。
                    </span>
                    {openLogsStatus ? (
                      <span className="settings-panel__option-desc">
                        {openLogsStatus}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="settings-panel__path-btn settings-panel__path-btn--accent"
                    onClick={() => void handleOpenLogs()}
                  >
                    打开
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "ai" && (
            <>
              {loadError ? (
                <p className="settings-panel__error">{loadError}</p>
              ) : null}

              <div className="settings-panel__section">
                <h3>Excalidraw AI</h3>
                <p className="settings-panel__section-desc">
                  用于文本生成图、图转代码和素材图标打标签；请求由服务器代理到该
                  Base URL。
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
                  用于 MindMap 内的 AI 生成，独立于 Excalidraw
                  配置；请求由服务器代理到该 Base URL。
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
