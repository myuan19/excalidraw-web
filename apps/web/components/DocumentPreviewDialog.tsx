import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { buildEmbedEditUrl, prepareEmbedData } from "../data/embedDocument";
import { isCorruptCatalogFile } from "../data/catalogCapabilities";
import { editorRegistry } from "../editors/registry";
import { ServerSync, type ServerFile } from "../data/ServerSync";

import "./DocumentPreviewDialog.scss";

const LazyMindMapEmbedViewer = lazy(
  () => import("../embed/MindMapEmbedViewer"),
);
const LazyExcalidrawEmbedViewer = lazy(
  () => import("../embed/ExcalidrawEmbedViewer"),
);

type DocumentPreviewDialogProps = {
  fileId: string;
  fileName: string;
  kind: string;
  open: boolean;
  onClose: () => void;
  onImport?: () => void;
  importable?: boolean;
};

export function DocumentPreviewDialog({
  fileId,
  fileName,
  kind,
  open,
  onClose,
  onImport,
  importable = false,
}: DocumentPreviewDialogProps) {
  const resolvedKind = editorRegistry.resolveKind(kind);
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fileId) {
      return;
    }
    let cancelled = false;
    setError(null);
    void ServerSync.getFile(fileId, { force: true })
      .then((next) => {
        if (!cancelled) {
          if (isCorruptCatalogFile(next)) {
            setFile(next);
            setError(next.parse_error || "文件已损坏，无法预览或导入");
            return;
          }
          setFile(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, open]);

  const preparedData = useMemo(() => {
    if (!file?.data) {
      return null;
    }
    try {
      return prepareEmbedData(resolvedKind, file.data);
    } catch {
      return file.data;
    }
  }, [file?.data, resolvedKind]);

  const editUrl = buildEmbedEditUrl(fileId, resolvedKind);

  if (!open) {
    return null;
  }

  return (
    <div className="doc-preview-dialog" role="dialog" aria-modal="true">
      <div className="doc-preview-dialog__backdrop" onClick={onClose} />
      <div className="doc-preview-dialog__panel">
        <header className="doc-preview-dialog__header">
          <div className="doc-preview-dialog__title">{fileName || "预览"}</div>
          <div className="doc-preview-dialog__actions">
            {importable && onImport ? (
              <button
                type="button"
                className="doc-preview-dialog__btn doc-preview-dialog__btn--primary"
                onClick={onImport}
              >
                导入
              </button>
            ) : null}
            <button
              type="button"
              className="doc-preview-dialog__btn"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </header>
        <div className="doc-preview-dialog__body">
          {error ? (
            <div className="doc-preview-dialog__error">{error}</div>
          ) : !preparedData ? (
            <div className="doc-preview-dialog__loading">正在加载预览…</div>
          ) : (
            <Suspense fallback={<div className="doc-preview-dialog__loading">正在加载预览…</div>}>
              {resolvedKind === "mindmap" ? (
                <LazyMindMapEmbedViewer data={preparedData} editUrl={editUrl} />
              ) : (
                <LazyExcalidrawEmbedViewer data={preparedData} editUrl={editUrl} />
              )}
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
