import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CaptureUpdateAction,
  Excalidraw,
  ExcalidrawAPIProvider,
  THEME,
} from "@excalidraw/excalidraw";

import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";
import { ServerSync, type ServerFile } from "../../data/ServerSync";
import { useEditorDocumentTitle } from "../../lib/appBranding";

import { useForkFileSave } from "./useForkFileSave";

function normalizeExcalidrawData(raw: unknown, name?: string) {
  try {
    return ExcalidrawAdapter.parse(raw);
  } catch {
    return ExcalidrawAdapter.createEmpty(name);
  }
}

export default function ExcalidrawEditorShell() {
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileId = getFileIdFromHash();
  const saveFile = useForkFileSave(fileId);
  const saveTimerRef = useRef<number | null>(null);

  useEditorDocumentTitle(file?.name);

  useEffect(() => {
    let cancelled = false;
    if (!fileId) {
      setFile(null);
      return;
    }
    ServerSync.getFile(fileId, { force: true })
      .then((next) => {
        if (!cancelled) {
          setFile(next);
          setError(null);
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
  }, [fileId]);

  const documentData = useMemo(
    () => normalizeExcalidrawData(file?.data, file?.name),
    [file?.data, file?.name],
  );

  const initialData = useMemo(
    () => ({
      elements: documentData.elements ?? [],
      appState: documentData.appState ?? {},
      files: documentData.files ?? {},
      scrollToContent: true,
    }),
    [documentData],
  );

  const handleChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      if (!fileId) {
        return;
      }
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        const nextData = {
          type: "excalidraw",
          version: documentData.version ?? 2,
          source: "editorhub",
          elements,
          appState: {
            ...(typeof appState === "object" && appState !== null ? appState : {}),
            name: file?.name,
          },
          files,
        };
        void saveFile(nextData, "interval", file?.name);
      }, 800);
    },
    [documentData.version, file?.name, fileId, saveFile],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  if (error) {
    return <div style={{ padding: 24, color: "#c92a2a" }}>{error}</div>;
  }

  if (!file) {
    return <div style={{ padding: 24 }}>正在加载...</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ExcalidrawAPIProvider>
        <Excalidraw
          key={file.id}
          initialData={initialData}
          name={file.name}
          theme={
            (documentData.appState as { theme?: string } | undefined)?.theme === "dark"
              ? THEME.DARK
              : THEME.LIGHT
          }
          isCollaborating={false}
          onChange={handleChange}
          captureUpdate={CaptureUpdateAction.EVENTUALLY}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
            },
          }}
          handleKeyboardGlobally={true}
        />
      </ExcalidrawAPIProvider>
    </div>
  );
}
