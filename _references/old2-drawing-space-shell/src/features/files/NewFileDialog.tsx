import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { listHomeEditors } from "@/features/home/listHomeEditors";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewFileDialogProps {
  open: boolean;
  initialKind?: string;
  onClose(): void;
  onCreate(name: string, kind: string): void;
}

export function NewFileDialog({ open, initialKind, onClose, onCreate }: NewFileDialogProps) {
  const fileKinds = useMemo(() => listHomeEditors(), []);
  const defaultKind = fileKinds.at(0)?.fileKind ?? "excalidraw";
  const [kind, setKind] = useState(defaultKind);
  const [name, setName] = useState("未命名");

  useEffect(() => {
    if (open) {
      const nextKind = initialKind && fileKinds.some((entry) => entry.fileKind === initialKind)
        ? initialKind
        : defaultKind;
      setKind(nextKind);
    }
  }, [open, initialKind, fileKinds, defaultKind]);

  function handleCreate() {
    const trimmed = name.trim() || "未命名";
    onCreate(trimmed, kind);
    setName("未命名");
    setKind(defaultKind);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleCreate();
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>新建文件</DialogTitle>
      </DialogHeader>

      {fileKinds.length === 0 ? (
        <p className="new-file-empty-msg">当前未注册可用的编辑器类型。</p>
      ) : (
        <div
          className={cn(
            "new-file-kind-grid",
            fileKinds.length === 1 && "new-file-kind-grid--one",
            fileKinds.length === 2 && "new-file-kind-grid--two",
            fileKinds.length >= 3 && "new-file-kind-grid--many",
          )}
        >
          {fileKinds.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setKind(entry.fileKind)}
              className={cn(
                "new-file-kind-option",
                kind === entry.fileKind && "new-file-kind-option--active",
              )}
            >
              <span className={cn(entry.icon, "new-file-kind-option-icon")} />
              <span className="new-file-kind-label">{entry.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-lg">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="文件名称"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          返回
        </Button>
        <Button onClick={handleCreate} disabled={fileKinds.length === 0}>
          创建并打开
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
