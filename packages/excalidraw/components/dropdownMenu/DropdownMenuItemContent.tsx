import type { JSX } from "react";
import { useDevice } from "../App";

const MenuItemContent = ({
  textStyle,
  icon,
  shortcut,
  children,
  badge,
}: {
  icon?: JSX.Element;
  shortcut?: string;
  textStyle?: React.CSSProperties;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) => {
  const device = useDevice();
  return (
    <>
      {icon && <div className="dropdown-menu-item__icon">{icon}</div>}
      <div style={textStyle} className="dropdown-menu-item__text">
        {children}
      </div>
      {badge && <div className="dropdown-menu-item__badge">{badge}</div>}
      {shortcut && !device.editor.isMobile && (
        <div className="dropdown-menu-item__shortcut">{shortcut}</div>
      )}
    </>
  );
};
export default MenuItemContent;
