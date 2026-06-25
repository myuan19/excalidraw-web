import * as Popover from "@radix-ui/react-popover";
import { useMemo } from "react";
import { ButtonIcon } from "../ButtonIcon";
import { TextIcon } from "../icons";
import type { FontFamilyValues } from "../../element/types";
import { t } from "../../i18n";
import { isDefaultFont } from "./FontPicker";

interface FontPickerTriggerProps {
  selectedFontFamily: FontFamilyValues | null;
  isOpened?: boolean;
  compactMode?: boolean;
}

export const FontPickerTrigger = ({
  selectedFontFamily,
  isOpened = false,
  compactMode = false,
}: FontPickerTriggerProps) => {
  const isTriggerActive = useMemo(
    () =>
      isOpened ||
      Boolean(selectedFontFamily && !isDefaultFont(selectedFontFamily)),
    [isOpened, selectedFontFamily],
  );

  return (
    <Popover.Trigger asChild>
      {/* Empty div as trigger so it's stretched 100% due to different button sizes */}
      <div>
        <ButtonIcon
          standalone
          icon={TextIcon}
          title={t("labels.showFonts")}
          className="properties-trigger"
          testId={"font-family-show-fonts"}
          active={isTriggerActive}
          style={
            compactMode
              ? {
                  width: "2rem",
                  height: "2rem",
                }
              : undefined
          }
          // no-op
          onClick={() => {}}
        />
      </div>
    </Popover.Trigger>
  );
};
