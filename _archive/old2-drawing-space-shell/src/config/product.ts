/** 用户可见的产品元信息与更新日志（应用内「关于 / 更新日志」与此文件同步） */

export const APP_VERSION = "0.3.0";
export const APP_NAME = "Drawing Space";
export const APP_NAME_ZH = "绘图空间";

export interface ChangelogRelease {
  version: string;
  date: string;
  summary?: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: "0.3.0",
    date: "2026-05-20",
    summary: "主页重构与临时文件：新建可先在前端编辑，保存后再入库。",
    added: [
      "可滚动主页：概览统计、快捷新建、最近文件右栏列表与左侧预览",
      "临时文件：新建默认仅存于本地，最近列表显示「临时」标记",
      "侧栏「主页」置于首位；点击「编辑器」无打开文件时弹出新建对话框",
    ],
    changed: [
      "保存：临时文件首次保存时正式创建服务器文件并出现在文件管理中",
      "嵌入与历史：仅对已保存的文件可用",
      "离开编辑器：已落库文件的本地草稿仍会提示保存；临时文件可直接切换视图",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-05-20",
    summary: "同步、嵌入与 MindMap 保存体验补强。",
    added: [
      "MindMap 保存状态回传与原生落盘链路",
      "Embed Token 读取同源校验",
      "前端运行日志上报",
    ],
    changed: [
      "素材库支持分组同步与本地镜像回退",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-05-20",
    summary: "编辑器与 AI、素材库能力接入。",
    added: [
      "多编辑器注册架构（Excalidraw、MindMap、文本等）",
      "AI 文生图 / 图转代码、TTD 对话与历史",
      "Excalidraw 素材库加载与保存、快捷键 Ctrl/⌘+S 保存",
      "本地草稿、冲突提示与 Delta 恢复",
    ],
    changed: [
      "文件管理支持导入、移动、缩略图与移动端文件夹抽屉",
      "历史版本支持恢复前草稿确认",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-20",
    summary: "新架构初始版本（Drawing Space Shell）。",
    added: [
      "文件树与多格式文档适配",
      "设置：主题、语言、AI 与嵌入管理",
      "深链打开文件与 Embed 只读模式",
    ],
  },
];

export interface HelpTopic {
  id: string;
  questionKey: "helpQ1" | "helpQ2" | "helpQ3" | "helpQ4" | "helpQ5" | "helpQ6" | "helpQ7" | "helpQ8";
  answerKey: "helpA1" | "helpA2" | "helpA3" | "helpA4" | "helpA5" | "helpA6" | "helpA7" | "helpA8";
}

export const HELP_TOPICS: HelpTopic[] = [
  { id: "home", questionKey: "helpQ1", answerKey: "helpA1" },
  { id: "temp", questionKey: "helpQ2", answerKey: "helpA2" },
  { id: "save", questionKey: "helpQ3", answerKey: "helpA3" },
  { id: "draft", questionKey: "helpQ4", answerKey: "helpA4" },
  { id: "embed", questionKey: "helpQ5", answerKey: "helpA5" },
  { id: "history", questionKey: "helpQ6", answerKey: "helpA6" },
  { id: "leave", questionKey: "helpQ7", answerKey: "helpA7" },
  { id: "shortcut", questionKey: "helpQ8", answerKey: "helpA8" },
];
