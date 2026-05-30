import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function HomeLeaveDialog({
  open,
  fileName,
  saving,
  onClose,
  onSaveAndLeave,
  onDiscardAndLeave,
}: {
  open: boolean;
  fileName: string;
  saving: boolean;
  onClose(): void;
  onSaveAndLeave(): void;
  onDiscardAndLeave(): void;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>离开编辑器</DialogTitle>
      </DialogHeader>
      <p className="home-leave-desc">
        「{fileName}」有未保存的修改。是否先保存再继续？
      </p>
      <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          取消，继续编辑
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          onClick={onDiscardAndLeave}
          className="text-danger hover:bg-danger-soft"
        >
          不保存，放弃修改
        </Button>
        <Button disabled={saving} onClick={onSaveAndLeave}>
          {saving ? "保存中…" : "保存并继续"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
