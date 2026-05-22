import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function SaveConflictDialog({
  open,
  fileName,
  onReload,
  onOverwrite,
  onDismiss,
}: {
  open: boolean;
  fileName: string;
  onReload(): void;
  onOverwrite(): void;
  onDismiss(): void;
}) {
  return (
    <Dialog open={open} onClose={onDismiss} size="md">
      <div className="flex flex-col gap-md">
        <h2 className="save-conflict-title">保存冲突</h2>
        <p className="save-conflict-copy">
          「{fileName}」在服务器上已被其他会话更新。你可以加载服务器最新版本，或用当前编辑内容覆盖服务器版本。
        </p>
        <div className="flex flex-wrap justify-end gap-sm">
          <Button variant="secondary" onClick={onDismiss}>
            稍后处理
          </Button>
          <Button variant="secondary" onClick={onReload}>
            加载服务器版本
          </Button>
          <Button onClick={onOverwrite}>
            覆盖保存
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
