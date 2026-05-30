import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import {
  continueEditingTempSession,
  discardTempAndCreateNew,
  discardTempAndShowPicker,
} from "./startNewTempFile";

export function TempSessionDialog() {
  const open = useAppStore((s) => s.tempSessionDialogOpen);
  const pendingKind = useAppStore((s) => s.pendingNewTempKind);
  const closeTempSessionDialog = useAppStore((s) => s.closeTempSessionDialog);
  const activeFile = useEditorStore((s) => s.activeFile);
  const fileName = activeFile?.name ?? "未命名";

  function handleClose() {
    closeTempSessionDialog();
  }

  function handleContinue() {
    continueEditingTempSession();
  }

  function handleDiscard() {
    if (!pendingKind) {
      discardTempAndShowPicker();
      return;
    }
    void discardTempAndCreateNew(pendingKind);
  }

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <DialogHeader>
        <DialogTitle>未保存的临时文件</DialogTitle>
      </DialogHeader>
      <p className="home-leave-desc">
        「{fileName}」尚未保存到服务器。要继续编辑上一次内容，还是丢弃并新建？
      </p>
      <p className="home-leave-desc text-muted">
        丢弃后仍可在「最近打开」中找到该临时文件。
      </p>
      <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handleClose}>
          取消
        </Button>
        <Button
          variant="secondary"
          onClick={handleDiscard}
          className="text-danger hover:bg-danger-soft"
        >
          {pendingKind ? "丢弃并新建" : "丢弃并重新选择"}
        </Button>
        <Button onClick={handleContinue}>
          继续编辑
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
