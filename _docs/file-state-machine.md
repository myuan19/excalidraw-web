# 文件状态机

本文描述 EditorHub Web 中文件从新建、编辑、保存、放弃到异常恢复的状态转换。这里的“临时文件”指用户可见的待保存本地草稿，不等同于代码里的 `local-draft:*` 技术 id。

## 核心标识

- `server file`：服务器已有记录的文件，id 为服务端文件 id。
- `local-draft:*`：浏览器本地分配的新建会话 id。新建时立即分配，但未必是用户可见的临时文件。
- `baselineHash`：当前文件的服务端/初始内容基线。
- `draftHash`：浏览器当前编辑内容的 hash。
- `localCache`：浏览器本地缓存的可恢复内容。
- `localEditTime`：本地草稿或服务端文件产生未同步修改的时间。
- 最近列表：通过 `recordRecentFileAccess` 记录。已编辑的 local-draft 必须进入最近列表，以支持异常退出后恢复。

## 状态定义

### 1. 新建空白会话

创建入口会先分配 `local-draft:*`，并写入初始内容与 hash：

- `LocalDraftSessions.upsert` 建立索引记录。
- `FileSyncState.alignHashes(id, initialHash)` 让 `baselineHash === draftHash`。
- 不写入最近列表。
- 不展示为用户可见临时文件。

转换条件：

- 用户未编辑就离开：直接 `discardLocalDraftSession`，不弹保存询问。
- 用户产生实质编辑：进入“可恢复本地草稿”。

模板判定：

- Mind Map 的新建模板定义为“只有一个根节点”。只要 local-draft 当前内容仍只有根节点，就视为未修改，即使根节点文本或 view 状态产生了中间 hash 差异。
- Excalidraw 的新建模板按空白 Excalidraw scene hash 判断。
- 模板判定不用于覆盖服务器文件：服务器文件是否修改仍按当前内容与服务器基线比较。

### 2. 可恢复本地草稿（用户可见临时文件）

条件：

- id 是 `local-draft:*`。
- `hasRecoverableLocalDraft(id) === true`。
- 通常表现为 `draftHash !== baselineHash`，或 local cache 中有实质内容。

进入动作：

- 写入 `localCache`。
- 写入 `localEditTime`。
- 调用 `notifyLocalDraftEdited`，更新 `LocalDraftSessions` 并加入最近列表。
- UI 可显示为黄色/未保存至服务器。

离开规则：

- 点击“文件”、最近切换、原生返回等离开入口，先同步当前编辑器内容再判断状态。
- 若仍是可恢复本地草稿，先弹“是否保存”。
- 选择“保存”后走保存新文档流程，创建服务器版本。
- 选择“不保存”后，再弹“放弃临时文档”二次确认。
- 二次确认“确定放弃”后才调用 `discardLocalDraftSession`。

### 3. 服务器已同步

条件：

- 文件存在服务器 id。
- `draftHash === baselineHash`，或没有 draft hash。

行为：

- 进入编辑器时使用服务器内容或本地缓存中的已同步内容。
- 点击返回文件列表时直接离开。
- UI 可显示为绿色/已保存。

转换条件：

- 用户修改内容后，进入“服务器文件本地修改”。

### 4. 服务器文件本地修改

条件：

- 文件存在服务器 id。
- `draftHash !== baselineHash`。

进入动作：

- 写入 `localCache` 与 `localEditTime`。
- 文件列表/缩略图优先展示本地草稿状态。

离开规则：

- 点击“文件”或切换到其他文件时，先弹“是否保存”。
- 选择“保存”后上传到服务器，服务端返回 sha 后 `alignHashes`，回到“服务器已同步”。
- 选择“不保存”后清掉本地缓存和本地 hash，回到服务器版本。

### 5. 保存新文档中

从可恢复本地草稿选择“保存”进入：

- `SaveNewDocumentDialog` 收集名称和目录。
- `saveNewDocument` 创建服务器文件并上传当前内容。
- 成功后移除 `local-draft:*` 会话与本地缓存。
- 若保存后继续编辑，hash 切换到服务器文件 id。
- 若保存并返回，保存成功后回到文件列表。

失败时：

- 不丢弃 local-draft。
- 保留本地可恢复状态。
- 用户可继续编辑或稍后从最近列表恢复。

### 6. 已放弃

触发条件：

- 未编辑的新建空白会话离开。
- 用户在“放弃临时文档”二次确认中确认。
- 用户删除文件列表中的 local-draft。

清理动作：

- `LocalDraftSessions.remove`。
- 从最近列表移除。
- 清理 `localCache`、hash 状态、`localEditTime`、本地缩略图。
- 清理历史兼容缓存键。

## 异常退出恢复

目标：用户有实质编辑但未保存到服务器时，下次仍能从最近列表打开。

正常编辑路径：

- 编辑器变更触发 `markDocumentChanged`。
- 防抖更新 `draftHash`、`localCache`、`localEditTime`。
- 对 local-draft 调用 `notifyLocalDraftEdited`，加入最近。

异常退出路径：

- Excalidraw 在 `beforeunload` 中 flush dirty 状态并写 `localCache`。
- Mind Map 在 `beforeunload` 中写 `draftHash` 与 `localCache`。
- 若此时是 dirty 的 `local-draft:*`，必须调用 `notifyLocalDraftEdited`，确保进入最近列表。

恢复入口：

- 文件列表最近视图读取最近记录。
- 若记录是 local-draft，通过 `LocalDraftSessions.get` 和 `draftSessionToServerFile` 还原为卡片。
- 打开后从 `FileSyncState.getLocalCache` 恢复内容。

## 离开入口统一规则

所有离开编辑器入口应收敛到同一套守卫：

- 侧边悬浮球“文件”。
- 最近列表切换到其他文件。
- 原生 Mind Map 返回消息 `hostBackToFiles`。
- 保存后返回。

统一处理：

1. 设置 pending navigation（若目标不是主页）。
2. 同步当前编辑内容到 dirty 状态。
3. 调用 `shouldPromptEditorHomeNavDialog` 判断是否需要第一层保存询问。
4. local-draft 且选择“不保存”时，再调用 `useLocalDraftLossConfirm` 做二次确认。
5. 用户取消任一弹窗时清理 pending navigation，不跳转。

## 修改状态单一入口

文件是否“已修改”由 `app/data/fileModificationState.ts` 统一判断，并输出两个 UI/流程状态：

- `draftStatus`：给侧边悬浮球使用，`draft` 为黄色，`synced` 为绿色。
- `shouldPromptOnLeave`：给编辑器离开守卫使用，决定是否弹第一层“是否保存”。

调用方不应直接用 `local-draft:*` 或单独的 `FileSyncState.hasUnsavedChanges` 推断用户可见状态。local-draft 必须先判断是否仍等同模板；服务器文件必须按服务器基线判断。

## 不变量

- 仅有 `local-draft:*` id 不代表用户可见临时文件；必须有可恢复编辑才算。
- 未编辑的新建空白文件离开时不弹窗、不进最近、直接丢弃。
- 可恢复 local-draft 离开时不能直接丢弃，必须先保存询问，再二次确认。
- Mind Map local-draft 只有根节点时始终视为模板未修改，小球应为绿色，离开时直接丢弃。
- 历史版本入口允许对 local-draft 打开；没有服务器版本时显示本地草稿状态和“暂无服务器版本”。
- 保存失败不能删除 local-draft。
- 异常退出时，只要有实质编辑，就必须可从最近列表恢复。
- `SaveNewDocumentDialog` 只负责保存；丢弃 local-draft 必须通过 `discardLocalDraftSession`，且用户可见路径必须经过二次确认。

## 关键实现位置

- 修改状态入口：`app/data/fileModificationState.ts`
- 新建会话：`app/data/bootstrapLocalDraftSession.ts`
- 状态判断：`app/data/editorLeaveHome.ts`
- 本地草稿索引：`app/data/localDraftSessions.ts`
- 放弃清理：`app/data/discardLocalDraftSession.ts`
- 保存新文档：`app/hooks/useSaveNewDocumentDialog.ts`
- 二次确认：`app/hooks/useLocalDraftLossConfirm.ts`
- Excalidraw 保存/离开：`app/editors/excalidraw/useForkFileSave.ts`
- Mind Map 保存/离开：`app/editors/mindmap/useMindMapFileSave.ts`
- 文件列表/最近恢复：`app/hooks/useFileListController.tsx`
