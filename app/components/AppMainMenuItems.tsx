import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { actionLoadScene } from "@excalidraw/excalidraw/actions";
import { getShortcutFromShortcutName } from "@excalidraw/excalidraw/actions/shortcuts";
import {
  useExcalidrawActionManager,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import DropdownMenuItem from "@excalidraw/excalidraw/components/dropdownMenu/DropdownMenuItem";
import {
  ExportIcon,
  ExportImageIcon,
  LoadIcon,
} from "@excalidraw/excalidraw/components/icons";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "@excalidraw/excalidraw/components/Trans";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import React from "react";

/** 上传本地 .excalidraw / JSON（原「打开」） */
export const MenuItemUploadScene: React.FC = () => {
  const { t } = useI18n();
  const actionManager = useExcalidrawActionManager();
  const elements = useExcalidrawElements();

  if (!actionManager.isActionEnabled(actionLoadScene)) {
    return null;
  }

  const handleSelect = async () => {
    if (
      !elements.length ||
      (await openConfirmModal({
        title: t("overwriteConfirm.modal.loadFromFile.title"),
        actionLabel: t("overwriteConfirm.modal.loadFromFile.button"),
        color: "warning",
        description: (
          <Trans
            i18nKey="overwriteConfirm.modal.loadFromFile.description"
            bold={(text) => <strong>{text}</strong>}
            br={() => <br />}
          />
        ),
      }))
    ) {
      actionManager.executeAction(actionLoadScene);
    }
  };

  return (
    <DropdownMenuItem
      icon={LoadIcon}
      onSelect={handleSelect}
      data-testid="load-button"
      shortcut={getShortcutFromShortcutName("loadScene")}
      aria-label="上传"
    >
      上传
    </DropdownMenuItem>
  );
};
MenuItemUploadScene.displayName = "MenuItemUploadScene";

/** 下载 / 导出 JSON（原「导出」对话框） */
export const MenuItemDownloadJson: React.FC = () => {
  const setAppState = useExcalidrawSetAppState();
  return (
    <DropdownMenuItem
      icon={ExportIcon}
      onSelect={() => {
        trackEvent("export", "json", "menu");
        setAppState({ openDialog: { name: "jsonExport" } });
      }}
      data-testid="json-export-button"
      aria-label="下载"
    >
      下载
    </DropdownMenuItem>
  );
};
MenuItemDownloadJson.displayName = "MenuItemDownloadJson";

/** 导出为图片 */
export const MenuItemExportImage: React.FC = () => {
  const setAppState = useExcalidrawSetAppState();
  const { t } = useI18n();
  return (
    <DropdownMenuItem
      icon={ExportImageIcon}
      data-testid="image-export-button"
      onSelect={() => setAppState({ openDialog: { name: "imageExport" } })}
      shortcut={getShortcutFromShortcutName("imageExport")}
      aria-label={t("buttons.exportImage")}
    >
      导出图片
    </DropdownMenuItem>
  );
};
MenuItemExportImage.displayName = "MenuItemExportImage";
