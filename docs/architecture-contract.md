# 架构契约 v0.1

## T1 UI 外壳补充（2026-09-17）

依据 [ADR-004](ADR-004-base-ui-shell.md)，Base UI/React 拥有应用外壳的视图、菜单与对话框交互；`main.ts` 继续拥有打开/导出流程、编辑事务、iframe 映射与 IPC 队列。两者通过 UI 状态快照与动作回调连接，UI 不直接调用原生文件或修改文档 DOM。状态至少包含 filename、editing、busy、dirty、canUndo、canRedo、activeInput、menuOpen、dialog 与 notice。弹窗取消必须完成原有 guardUnsaved 的 Promise；模态弹窗打开时不得触发文档快捷键。

选择局部接入以降低编辑回归风险；全量 React 重写作为替代方案暂不采用。现有 `contracts.ts` 的 T1 类型、命令字段、字节补丁、资源权限及 [ADR-003](ADR-003-webkit-input-surface.md) 继续有效。

状态：进入技术原型前的契约草案。选择依据见 [ADR-001](ADR-001-lightweight-desktop.md)，实施门槛见 [实施计划](implementation-plan.md)。交互已定稿；本契约在 T0 验证后冻结，变更需要更新 ADR 与契约测试。

## 1. 所有权与权威

| 模块                 | 拥有的数据与职责                                                   | 禁止越界                                           |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Rust DocumentSession | 原始字节、文件摘要、文档 ID、会话 epoch、草稿 revision、可编辑清单 | 不让页面传任意文件路径读写                         |
| Rust PatchEngine     | UTF-8 字节区间、原文校验、文字转义、补丁合成、撤销事务             | 不接受任意 outerHTML 或新标签                      |
| Rust VersionStore    | 文档基线、不可变版本、草稿、当前版本、操作幂等记录                 | 不由前端直接访问数据库                             |
| Rust ResourceGateway | 当前文档资源目录、资源类型、规范路径校验                           | 不提供目录遍历、通用 HTTP 代理、系统文件读取       |
| 可信工具层 TS        | 可见 UI、原位编辑事务、渲染同步、IPC 状态                          | 不自行宣布保存成功                                 |
| 解析 Worker          | 原文 AST、源区间、文本路径清单、渲染副本生成                       | 不负责磁盘写入和版本持久化                         |
| 用户文档 iframe      | 静态展示、临时文本输入结果                                         | 不执行用户脚本、不获取原生能力、不作为文件保存依据 |

一个打开文档对应一个活动 Session。首版单窗口、单文档；打开另一个文档要结束前一个 Session，取消旧解析任务和资源请求，移除监听器并释放 AST/DOM 引用。

## 2. 文档状态

```text
Empty → Opening → ReadyPreview
                  ↕
               ReadyEditing → TextTransaction → ReadyEditing
                  ↕
                 Saving

任一 Ready 状态可打开 VersionDialog。
保存失败回到原 Ready 状态并保留 dirty。
回退事务成功后回到 ReadyEditing。
关闭或换文件经过 UnsavedDecision，再到 Empty / Opening。
```

状态维度分开记录：`mode=preview|edit`、`dirty`、`pendingInput`、`pendingIPC`、`diskDraftPersisted`。不能用一个“已编辑”布尔值混淆它们。

按 Esc 取消尚未完成的文字事务；Enter、失焦和点击保存完成事务。输入法组合期不把 Enter 误判为完成。切换预览先完成当前文字事务并等待核心接受，随后移除编辑辅助。预览不是自动保存版本。

「已保存」只由 SQLite 提交成功的确认产生；IPC 发送成功、下载发起和 DOM 变化均不等于已保存。

## 3. 文本清单与补丁类型

以下类型表达逻辑契约，不限定 Rust/TS 的序列化命名。

```ts
type DocumentId = string; // UUID，不等于文件路径或内容 hash
type SessionId = string; // 随机、不跨打开会话复用
type NodeId = string; // baseId + 原始文本区间派生的稳定标识
type Revision = number; // 当前会话内单调递增；拒绝超出安全整数范围

type TextEntry = {
  nodeId: NodeId;
  startByte: number; // 原始 UTF-8 字节偏移，包含文件 BOM 的偏移
  endByte: number; // 半开区间 [startByte, endByte)
  rawDigest: string; // 原始区间摘要
  originalDecoded: string;
  domPath: number[]; // 按 childNodes 索引，不按文字搜索
  parentFingerprint: string;
  kind: "html-data-text"; // v1 排除脚本、style、表单值和复杂 raw-text
};

type TextChange = { nodeId: NodeId; oldText: string; newText: string };
type EditTransaction = {
  operationId: string;
  sessionId: SessionId;
  expectedRevision: Revision;
  changes: TextChange[];
};

type Version = {
  versionId: string;
  documentId: DocumentId;
  baseId: string;
  sequence: number;
  createdAt: string;
  reason: "save" | "restore" | "pre-restore-backup";
  restoredFrom?: string;
  patches: Array<{ nodeId: NodeId; newText: string }>;
};
```

v1 可编辑范围为有效 UTF-8 的静态 HTML，支持 BOM、CRLF 和实体；非 UTF-8 或声明与字节矛盾时先只读，后续显式转换或增加编码适配，不能静默改编码。原始字节完整保留。

parse5 的字符串位置转换成原始 UTF-8 字节区间时必须使用明确的映射表，不能直接把 JavaScript UTF-16 offset 当字节下标。Emoji、代理对、BOM、CRLF、字符实体分别验证。

可编辑清单来自可信 Worker。Rust 校验边界、区间不交叠、原文摘要、文档身份和数据大小后登记；不声称在没有第二个 HTML 解析器的情况下，Rust 能独立重做全部 HTML 语义判断。用户文档没有清单登记和 IPC 权限。

## 4. 导出不变量

1. `baseBytes` 永不修改，所有版本的补丁区间指向该基线。
2. 同一 NodeId 只存在一个最终替换值。新文字等于原始解码文字时删除补丁，以保留原有实体写法。
3. 仅接受清单登记的文本节点；旧值必须等于当前 revision 的值。
4. 原始区间互不重叠，偏移位于有效字符边界，原始摘要一致。
5. 根据文本上下文编码特殊字符，禁止让输入中的 `<script>` 变成标签。
6. 从原始字节顺序拼接所有替换片段，或按偏移倒序应用；不能对已移位的文本继续使用旧偏移。
7. 未改区间保持字节一致；DOCTYPE、head、标签、属性、注释、CSS、JS 均不重排。
8. 导出不包含工具条、数据映射标记、注入样式或 contenteditable。

DOM 路径、解码文本、父级指纹不能匹配时，该片段不可编辑。没有源码位置的隐式节点不能凭文本相似度补配。首次渲染结构改变、第三方浏览器容错差异、`noscript` 解析策略均需显式匹配。

## 5. 原位文字事务

以已有 Text 节点为修改单位，不重建整个父元素。通过 Selection/Range、beforeinput、composition 事件管理一次编辑事务。只接受事务允许的文本变化；结构变化、跨片段删除、格式粘贴和拖入节点必须阻止或回滚。

混合标签场景必须单独验证：允许编辑其中一个文本片段，不能把「欢迎 <strong>小明</strong> 加入」的父元素整个替换。IME 组合期允许浏览器临时状态，提交前校验结构并还原临时节点；无法可靠实现时，该类片段保持只读，而不是更换成富文本编辑器。

双击后的字形、行高、行宽沿用文档自身 CSS；辅助选框使用不占布局空间的方式。文字变化可以引起原 CSS 下的自然换行。编辑状态引入的可观察属性可能影响 `[contenteditable]` 等原页面选择器，这属于 T1 样本范围，不能直接承诺任意 CSS 下像素不变。

撤销栈存 `TextChange` 的正反操作，不存 DOM 或全量 HTML。首版内存预算 8 MiB 或 200 次文字事务，以先到者为限；裁剪早期撤销记录时保留持久版本。恢复版本同样作为可撤销的文本状态切换，但持久历史不被撤销删除。

## 6. IPC 接口快照

所有变更命令绑定可信工具窗口、SessionId、会话 epoch 和 operationId。权限白名单逐项开放，不使用文件系统通配权限。序列变更由 Rust 串行执行。

| 命令                   | 请求核心字段                                         | 成功结果                                              |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| open_document          | 原生对话框的受控选择；不是页面任意路径               | documentId、sessionId、baseId、原文读取句柄、资源范围 |
| register_text_manifest | sessionId、baseId、文本清单及摘要                    | 可接受节点集合；不可信来源不能调用                    |
| commit_text_edit       | EditTransaction                                      | revision、dirty、规范化后的变化                       |
| undo / redo            | sessionId、expectedRevision                          | 新 revision 与反向 / 正向文字变化                     |
| save_version           | sessionId、expectedRevision、operationId             | versionId、sequence、committedRevision                |
| list_versions          | documentId、游标、pageSize                           | 仅元信息和摘要，单页最多 50 条                        |
| restore_version        | sessionId、versionId、expectedRevision、operationId  | 新版本、可选备份版本、新 revision、变化集合           |
| export_version         | 已有 versionId 或当前 draft revision；原生保存对话框 | 完成写入后的路径和结果                                |
| close_document         | sessionId、草稿处置                                  | 关闭确认                                              |

核心只接受 nodeId 与文字值，不接受来自页面的任意源码替换或路径。operationId 保证保存与回退在重试时不会重复创建版本；同 ID 不同请求内容拒绝。

错误至少包括：`StaleRevision`、`UnknownNode`、`MappingMismatch`、`UnsupportedEncoding`、`ExternalFileChanged`、`PathOutsideScope`、`StorageFull`、`WriteFailed`、`Cancelled`。

收到旧 revision 的操作不静默覆盖，而是返回最新状态并停止后续保存。切换文件后旧 Session 的异步解析、写入请求全部失效。保存必须等待当前文字提交确认；核心拒绝“保存按钮先落盘、最后一次输入后到”的竞态。

## 7. 草稿、版本和磁盘事务

逻辑表：

```text
documents(id, source_path_metadata, current_base_id, head_version_id, ...)
bases(id, document_id, sha256, encoding, raw_bytes, text_manifest, ...)
versions(id, document_id, base_id, sequence, reason, restored_from, patch_map, ...)
drafts(document_id, base_id, revision, patch_map, updated_at, ...)
operations(operation_id, request_digest, result_metadata, ...)
```

SQLite 使用 WAL、外键和明确的事务；版本提交用足够的同步级别，具体设置由崩溃测试确认。退出关闭连接并处理 WAL，备份数据库时不能只复制主文件而漏掉未合并 WAL。

草稿在停止输入后约 500 ms 合并写入，持续输入约每 2 s 检查一次待写变化。无改动不启定时器。可用的组合期文本检查点只能进入恢复草稿，不能变成正式版本或破坏输入法事务；不可安全提取时等待 compositionend。关闭 / 切换前强制刷新。保存版本是独立事务，不能用草稿落盘代替。

Version 的 patch_map 是相对 base 的累计补丁集合，读取历史不用重放长链。版本对象不可变，回退只能追加。草稿备份与回退版本在一个 SQLite 事务提交；容量不足或失败则整体回滚，保留原草稿。

v1 不自动清理用户版本。数据增长达到设定提醒阈值时显示存储占用，后续清理需明确操作。数据库存应用用户数据目录，不写进原 HTML 的目录。

导出时采用临时文件写入、刷新、平台适配的替换策略；Windows 与 POSIX 的替换行为单独测试，不能把同一个 rename 调用当作跨平台保证。用户明确选中已有文件时才覆盖；写入失败保留目标文件并清理可识别临时文件。

## 8. 资源与执行边界

单个系统 WebView 内是可信宿主与静态文档 iframe。iframe 只允许同源 DOM 访问，不允许用户脚本执行；宿主事件函数负责编辑。用户文档不直接 postMessage 调用核心。

渲染投影会处理 base、资源地址、脚本节点、自动刷新、frame/object 等执行入口，但原始文件字节不变。脚本禁用依赖 sandbox 与 CSP 的共同约束，不能只依赖删除 `<script>`。不得为了显示某个复杂 HTML 而同时放开同源与用户脚本执行。

资源协议仅接收文档 token 与相对资源路径。Rust 根据用户授权确定根目录，规范化后防止 `..`、编码路径、符号链接越界和其他 session 路径复用。只提供允许的资源类型与正确 MIME；子文档、外部导航和资源请求不能升级成新的可信应用页面。

默认无远程资源加载；兼容选项只开放所需资源类型，并说明网络访问。加载 CSS 中的 `@import` / `url()` 与字体需要保持原文件基准 URL，不把所有文件改成 data URL，不复制整个目录。

Linux iframe IPC 边界与三端的脚本注入行为是 T1 阻断性验证项：若不能证明隔离有效，修订架构，不能通过扩大 capability 权限绕过。

## 9. Omarchy 平台适配

Linux 适配层只服务 Omarchy stable x86_64 的 Hyprland / Wayland 环境。发布 Arch 原生包与 PKGBUILD，运行依赖使用系统 `webkit2gtk-4.1` 等库；构建工具不进入终端用户依赖。

宿主采用正常 GTK/WebKitGTK 后端选择，不修改用户的 Hyprland、输入法或全局环境配置。文件选择器优先使用框架与系统现有能力，记录实际使用的 portal / GTK 路径；不为本应用启动常驻 portal 替代服务。仅注册窗口内快捷键，避免与 Omarchy 全局快捷键争用。

应用内工具条使用文档窗口内部独占 32px 的顶部栏，不创建依赖窗口管理器规则的独立浮动窗口。文档 iframe 与可信输入命中层从顶部栏下方开始，使用同一高度 token；macOS 顶部栏为原生窗口按钮预留位置。当前外壳布局以 ADR-004 的 2026-09-18 修订为准。长期设计中的版本记录使用同一 WebView 内模态对话框，降低焦点和缩放差异。

## 10. 兼容和性能预算的落实

常规性能范围见 ADR。大文件采用分层策略：超过 5 MiB 或 50,000 节点先提示可能变慢，解析 Worker 承担工作；首版超过 20 MiB 输入拒绝进入编辑并保留原文件，不静默卡死。阈值依据原型实测复审，不声称支持所有 HTML。

原文与当前补丁在核心持有，前端只保留当前渲染所需内容；建立紧凑映射后释放 AST，解析 Worker 空闲后终止。版本弹窗分页查询，历史内容在点击导出 / 回退时才物化。监听器随 Session 释放，不注册空转轮询或永久动画循环。

框架和依赖锁定精确版本及锁文件，Release 构建启用按需功能、裁剪符号和 LTO 的效果由实测决定。不随安装包带源码映射、大测试夹具、浏览器二进制、Node 或构建缓存。
