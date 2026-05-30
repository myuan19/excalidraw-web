import { create } from "zustand";
import { ServerSync } from "@/services/ServerSync";
import type { AIConfig } from "@/types/file";

export type ThemeMode = "light" | "dark" | "system";

const DEFAULT_AI_CONFIG: AIConfig = {
  excalidraw: { endpoint: "", apiKey: "", textToDiagramModel: "", diagramToCodeModel: "", iconTagModel: "" },
  mindmap: { endpoint: "", apiKey: "", model: "" },
};

interface SettingsState {
  theme: ThemeMode;
  language: string;
  aiConfig: AIConfig;
  aiConfigLoaded: boolean;
  aiConfigSaving: boolean;
  aiConfigError: string | null;

  setTheme(theme: ThemeMode): void;
  setLanguage(language: string): void;
  loadAIConfig(): Promise<void>;
  saveAIConfig(config: AIConfig): Promise<void>;
  setAIConfig(config: AIConfig): void;
  updateExcalidrawAI(updates: Partial<AIConfig["excalidraw"]>): void;
  updateMindmapAI(updates: Partial<AIConfig["mindmap"]>): void;
  setAIConfigLoaded(loaded: boolean): void;
}

function getStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem("excalidraw-theme");
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch { /* ignore */ }
  return "light";
}

function getStoredLanguage(): string {
  try {
    return localStorage.getItem("excalidraw-language") || "zh-CN";
  } catch {
    return "zh-CN";
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: getStoredTheme(),
  language: getStoredLanguage(),
  aiConfig: DEFAULT_AI_CONFIG,
  aiConfigLoaded: false,
  aiConfigSaving: false,
  aiConfigError: null,

  setTheme(theme) {
    localStorage.setItem("excalidraw-theme", theme);
    set({ theme });
  },

  setLanguage(language) {
    localStorage.setItem("excalidraw-language", language);
    set({ language });
  },

  async loadAIConfig() {
    try {
      const config = await ServerSync.getAIConfig();
      set({ aiConfig: config, aiConfigLoaded: true, aiConfigError: null });
    } catch (error) {
      set({
        aiConfigLoaded: true,
        aiConfigError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async saveAIConfig(config) {
    set({ aiConfigSaving: true, aiConfigError: null });
    try {
      await ServerSync.saveAIConfig(config);
      set({ aiConfig: config, aiConfigLoaded: true, aiConfigSaving: false });
    } catch (error) {
      set({
        aiConfigSaving: false,
        aiConfigError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setAIConfig(config) {
    set({ aiConfig: config, aiConfigLoaded: true });
  },

  updateExcalidrawAI(updates) {
    set((s) => ({
      aiConfig: { ...s.aiConfig, excalidraw: { ...s.aiConfig.excalidraw, ...updates } },
    }));
  },

  updateMindmapAI(updates) {
    set((s) => ({
      aiConfig: { ...s.aiConfig, mindmap: { ...s.aiConfig.mindmap, ...updates } },
    }));
  },

  setAIConfigLoaded(loaded) {
    set({ aiConfigLoaded: loaded });
  },
}));

export function isAIConfigured(config: AIConfig): boolean {
  return !!(config.excalidraw.endpoint && config.excalidraw.apiKey);
}
