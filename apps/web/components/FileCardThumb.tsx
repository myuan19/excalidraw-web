import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { editorIconForKind } from "../lib/appBranding";

import type { FileCardThumbBadge } from "../data/fileCardThumbDisplay";

import "./FileList.scss";

type FileCardThumbOwnProps = {
  kind: string;
  cardThumbSvg: string | null;
  thumbLoading?: boolean;
  thumbSwitchLoading?: boolean;
  thumbBlank?: boolean;
  badge?: FileCardThumbBadge;
  thumbBg?: string;
  className?: string;
  children?: ReactNode;
};

type FileCardThumbProps = FileCardThumbOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof FileCardThumbOwnProps>;

function isImageDataUrl(value: string): boolean {
  return /^data:image\//i.test(value.trim());
}

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

function FileCardThumbBadgeLabel({
  badge,
}: {
  badge: FileCardThumbBadge | null;
}) {
  if (badge === "temporary") {
    return (
      <span
        className="filelist__card-thumb-badge"
        title="尚未保存到本地文件夹"
      >
        临时
      </span>
    );
  }
  if (badge === "draft" || badge === "interrupted") {
    return (
      <span
        className="filelist__card-thumb-badge"
        title={
          badge === "interrupted"
            ? "上次异常退出，可恢复未保存内容"
            : "有未保存的修改"
        }
      >
        未保存
      </span>
    );
  }
  if (badge === "corrupt") {
    return (
      <span
        className="filelist__card-thumb-badge filelist__card-thumb-badge--warn"
        title="文件已损坏或格式无法识别"
      >
        已损坏
      </span>
    );
  }
  return null;
}

/** 文件列表卡片缩略图区域（含角标 / SVG / 加载 / 占位），供列表与最近悬停预览复用 */
export const FileCardThumb = forwardRef<HTMLDivElement, FileCardThumbProps>(
  (
    {
      kind,
      cardThumbSvg,
      thumbLoading = false,
      thumbSwitchLoading = false,
      thumbBlank = false,
      badge = null,
      thumbBg,
      className,
      children,
      style,
      ...rest
    },
    ref,
  ) => {
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
        <FileCardThumbBadgeLabel
          badge={thumbSwitchLoading ? null : badge}
        />
        {cardThumbSvg && isImageDataUrl(cardThumbSvg) ? (
          <img
            className="filelist__card-thumb-img"
            src={cardThumbSvg}
            alt=""
            draggable={false}
          />
        ) : cardThumbSvg ? (
          <div
            className="filelist__card-thumb-svg"
            dangerouslySetInnerHTML={{ __html: cardThumbSvg }}
          />
        ) : thumbLoading ? (
          <div
            className={[
              "filelist__card-thumb-loading",
              thumbSwitchLoading ? "filelist__card-thumb-loading--switch" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ) : thumbBlank ? null : (
          <FileCardThumbPlaceholder kind={kind} />
        )}
        {thumbSwitchLoading && cardThumbSvg ? (
          <div
            className="filelist__card-thumb-loading filelist__card-thumb-loading--switch"
            aria-hidden
          />
        ) : null}
        {children}
      </div>
    );
  },
);
