export type FileListToastItem = {
  id: string;
  message: string;
  variant: "notice" | "error";
  persistent?: boolean;
};

type FileListToastStackProps = {
  items: FileListToastItem[];
  onDismiss?: (id: string) => void;
};

/** 右下角消息气泡：持久任务贴底，普通提示向上堆叠。 */
export function FileListToastStack({ items, onDismiss }: FileListToastStackProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      className="filelist__toast-stack"
      role="region"
      aria-label="通知"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={[
            "filelist__toast",
            item.variant === "error"
              ? "filelist__toast--error"
              : "filelist__toast--notice",
            item.persistent ? "filelist__toast--persistent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role={item.variant === "error" ? "alert" : "status"}
        >
          <span className="filelist__toast-message">{item.message}</span>
          {item.variant === "error" && onDismiss ? (
            <button
              type="button"
              className="filelist__toast-dismiss"
              onClick={() => onDismiss(item.id)}
              aria-label="关闭错误提示"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
