import { eyeIcon, historyIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";
import { smallHouseIcon, toolbarSaveIcon } from "./appToolbarIcons";

export const AppMainMenu: React.FC<{
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  onGoHome: () => void;
  /** 私有部署：上传到当前文件（与顶栏「保存」一致）；未打开 fork 文件时不传 */
  onSaveToServer?: () => void;
  saveToServerPending?: boolean;
  onToggleHistory?: () => void;
}> = React.memo((props) => {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      {props.onSaveToServer && (
        <MainMenu.Item
          icon={toolbarSaveIcon}
          disabled={props.saveToServerPending}
          onSelect={() => {
            props.onSaveToServer?.();
          }}
        >
          保存到服务器
        </MainMenu.Item>
      )}
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Item
        icon={smallHouseIcon}
        onSelect={() => {
          props.onGoHome();
        }}
      >
        返回首页
      </MainMenu.Item>
      {props.onToggleHistory && (
        <MainMenu.Item
          icon={historyIcon}
          onSelect={() => {
            props.onToggleHistory?.();
          }}
        >
          历史版本
        </MainMenu.Item>
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
        onSelect={props.setTheme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
