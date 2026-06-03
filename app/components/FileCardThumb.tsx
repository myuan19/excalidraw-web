import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { editorIconForKind } from "../lib/appBranding";

import type { FileCardThumbBadge } from "../data/fileCardThumbDisplay";

import "./FileList.scss";

type FileCardThumbOwnProps = {
  kind: string;
  cardThumbSvg: string | null;
  thumbLoading?: boolean;
  badge?: FileCardThumbBadge;
  thumbBg?: string;
  className?: string;
  children?: ReactNode;
};

type FileCardThumbProps = FileCardThumbOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof FileCardThumbOwnProps>;

function FileCardThumbPlaceholder({ kind }: { kind: string }) {
  return (
    <div className="filelist__card-thumb-placeholder">
      <img
        className="filelist__image-icon"
        src={editorIconForKind(kind)}
        alt=""
        width={40}
        height={40}
        draggable={false}
      />
    </div>
  );
}

function FileCardThumbBadge({ badge }: { badge: FileCardThumbBadge }) {
  if (badge === "temp") {
    return (
      <span
        className="filelist__card-thumb-badge"
        title="仅保存在本机浏览器，尚未保存到服务器"
      >
        临时
      </span>
    );
  }
  if (badge === "draft") {
    return (
      <span
        className="filelist__card-thumb-badge"
        title="有未保存到服务器的更改"
      >
        未保存
      </span>
    );
  }
  return null;
}

/** 文件列表卡片缩略图区域（含角标 / SVG / 加载 / 占位），供列表与最近悬停预览复用 */
export const FileCardThumb = forwardRef<HTMLDivElement, FileCardThumbProps>(
  function FileCardThumb(
    {
      kind,
      cardThumbSvg,
      thumbLoading = false,
      badge = null,
      thumbBg,
      className,
      children,
      style,
      ...rest
    },
    ref,
  ) {
    const rootClass = ["filelist__card-thumb", className]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={rootClass}
        style={thumbBg ? { background: thumbBg, ...style } : style}
        {...rest}
      >
        <FileCardThumbBadge badge={badge} />
        {cardThumbSvg ? (
          <div
            className="filelist__card-thumb-svg"
            dangerouslySetInnerHTML={{ __html: cardThumbSvg }}
          />
        ) : thumbLoading ? (
          <div className="filelist__card-thumb-loading" />
        ) : (
          <FileCardThumbPlaceholder kind={kind} />
        )}
        {children}
      </div>
    );
  },
);
