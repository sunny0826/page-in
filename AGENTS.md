# PageIn 项目约束

本文件适用于整个仓库，记录已确认的产品、设计与工程约束。用户在当前任务中的明确新要求优先；约束变化时同步更新相关 ADR、契约和本文件，不把历史方案当作当前实现。

## 开发环境与命令

- 开发运行时、工具版本和环境配置统一由 mise 管理，以 [mise.toml](mise.toml) 为准；全局配置只提供默认值。终端、IDE、脚本和 CI 使用一致环境，开始工作时检查实际工具路径及版本。
- 保持 `package.json` 的 `packageManager`、`package-lock.json` 和 `src-tauri/Cargo.lock` 一致，安装依赖使用 `npm ci`。不得另引入 nvm、asdf、pyenv 或全局 npm/pip 安装作为平行的工具版本来源。
- 系统库、平台 SDK 和原生组件可使用必要的系统安装方式；mise 不支持的场景须记录限制及处理方案，不静默回退，也不擅自删除旧环境或停用常驻应用。
- Agent 的 shell 命令使用 `rtk` 前缀；需要原始输出或没有对应过滤器时使用 `rtk proxy`。开发命令通过 `rtk proxy mise exec -- …` 或 `rtk proxy mise run …` 执行。

常用命令：

```sh
rtk proxy mise exec -- npm ci
rtk proxy mise run dev
rtk proxy mise run check
rtk proxy mise exec -- npm run build
rtk proxy mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml --check
rtk proxy mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`mise run build` 和 `mise run release-macos` 当前是 macOS 入口，不作为 Windows / Linux 构建命令。

Linux 打包使用 `packaging/aur/PKGBUILD`（T1 落地），在干净 chroot 中构建，不得依赖 mise、全局 npm 安装或宿主私有环境；它使用系统 `nodejs` / `npm` / `rust`，实际版本写入验收记录。

## 产品与数据不变量

- PageIn 是轻量的本地 HTML 原位文字编辑器，保持页面原有排版、样式和本地资源。单文件模式打开 HTML；演示项目模式选择包含 `index.html` / `index.htm` 的文件夹。
- 系统文件关联和窗口拖放支持单个 `.html` / `.htm`，均走单文件模式与未导出确认；原生请求由 Rust 排队并签发 ID，前端不得传任意路径。系统关联不强制修改默认应用，单实例启动复用现有窗口。详见 [ADR-009](docs/ADR-009-native-file-open.md)。
- 原始字节不可变。导出只按已验证的 UTF-8 字节区间应用文字补丁，未修改区间保持逐字节一致。禁止通过 DOM 序列化、`outerHTML` 或整页重建保存内容。
- JavaScript 的 UTF-16 offset 不等于 UTF-8 字节偏移；映射须覆盖中文、Emoji、BOM、CRLF、实体和换行标题。无法可靠映射、复杂混合或带变换的片段保持只读，不猜测回写位置。
- xmp、noembed、noframes、plaintext 等 raw-text 上下文保持只读。pre/listing 的 `textContext` 区分是否需要首 LF 补偿；补丁外单独 CR 与新 LF 不得合并。所有编码补偿局限于已验证补丁区间，详见 [ADR-014](docs/ADR-014-edit-transaction-fidelity.md)。
- 导出创建新文件或新目录，不覆盖原始文件、已有目标或源项目内部路径。项目模式只修改入口 HTML，其余资源和空目录保持完整；拒绝外部已修改的入口、符号链接、特殊文件和越界路径。
- 当前限制：HTML 不超过 5 MiB / 50,000 节点；项目导出不超过 512 MiB / 10,000 个文件和目录。调整限制须同步契约、实现与验证。
- Rust 是源文件、补丁、会话及修订号的权威。写操作校验 session/revision；界面等待核心成功确认后才显示导出成功，失败保留未导出状态。关闭或换文件须处理未导出修改。
- 当前仅有会话内撤销/重做；SQLite、持久版本和跨重启草稿恢复尚未实现。不得将内存或 localStorage 描述为正式版本库。

## 架构与执行边界

- 使用 Tauri 2 + Rust + 系统 WebView；React / Base UI 负责应用外壳。保持单窗口、一个原生 WebView，不引入 Electron/CEF、Node 运行时或常驻本地服务。开发期 Vite 服务不属于发布运行时。
- `src/shell.tsx` 通过 `src/ui-state.ts` 的状态快照和动作回调连接引擎；`src/main.ts` 协调会话和 IPC 队列，`src/input-surface.ts` 管理输入事务，`src/document-frame.ts` 负责 iframe 解析与映射，`src/keyboard.ts` 解析快捷键意图。React 不接管用户文档 DOM，不直接操作原生文件。
- 用户文档是不可信内容。2026-09-20 用户要求报告与浏览器一致展示，报告预览按 [ADR-013](docs/ADR-011-isolated-live-reports.md) 在独立 `pagein-preview` 来源、仅 `sandbox="allow-scripts"` 的不透明 iframe 中执行本地脚本；不得同时授予 `allow-same-origin`，不得接触父页面或原生 IPC。编辑仍使用仅 `sandbox="allow-same-origin"` 的静态 iframe：冻结已渲染 HTML / Canvas 后重新净化，仅映射已验证的原始文字，生成内容只读。快照仅用于显示，绝不用于注册源文件或导出。原有 PPT 仍使用可信父页面适配器。
- 资源仅限用户授权目录中的允许类型（含本地 JS / MJS / JSON），规范化路径并检查越界；不提供任意路径读取、通用代理或默认远程资源加载。报告预览响应须强制 CSP 不透明脚本沙箱，校验预览 token 和 revision；快照限制为 16 MiB / 50,000 节点。
- 原位输入使用可信父页面的命中层和输入层；复制计算样式时必须排除 `-webkit-user-modify`，防止 WKWebView 输入变为只读。临时输入层、分页样式和包装标记不得进入导出。
- input-surface 接线，input-controller、input-transaction、input-geometry 管理原位输入。清空文字仍保留映射 Text 节点；提交等待 Rust 确认后才移除输入层，失败保留草稿并允许重试或 Esc 取消。元素及祖先的独立 scale/rotate/translate 与 transform 一并检查，无法可靠对齐时保持只读。动态快照只能为唯一源 marker、tag 和确认空值匹配的元素恢复空 Text 节点。
- 演示翻页只改变临时展示状态，不修改文档修订号。保留输入法组合期、Enter/Esc、撤销/重做及模态弹窗的焦点和快捷键边界。
- 放映从当前页进入原生全屏，隐藏顶部栏；报告使用隔离动态预览，PPT 沿用现有翻页。Esc 退出并恢复之前的编辑/预览和全屏状态。放映本身不修改文档，快捷键不得在放映期间触发编辑历史操作；PPT 原页面脚本仍禁用。

## 界面设计约束

- **所有操作按钮保持纯图标，包括对话框按钮。** 使用 tooltip 和 `aria-label` 说明用途，不擅自增加可见文字标签。
- 操作图标统一使用 Phosphor Icons Regular，按需导入并本地打包；顶部栏 24px 按钮内使用 16px 图标，沿用颜色 token，不混用手绘路径或不同图标库。
- 应用外壳只使用系统字体栈，不请求外部字体、远程样式或 CDN 资源；用户项目内已授权的本地字体仍可预览。
- 工具栏使用独占 32px 高度的顶部栏，与 macOS 红黄绿原生窗口按钮同一行；文档和输入命中层从顶部栏下方开始，不覆盖页面内容。图标按钮保持 24px。文件名区域维持可读性，当前字号 11px、最大宽度 156px，不退回过窄截断或随意放大整套控件。
- `src/style.css` 顶部 `:root` 是颜色、状态和阴影 token 的统一来源。组件复用面、文字、线条、绿色、状态、示例插画和阴影 token，不散布硬编码颜色。
- 10–11px 小字使用 `--caption` / `--muted` 等已校验的文字颜色，保持与实际背景至少 4.5:1 的对比度，不退回过浅灰色。
- 丢弃/不保存等危险操作沿用 `DialogAction.danger` → `ToolButton.danger` → `.button.danger` 的语义和暖红样式，不与普通确认操作混用。
- 欢迎页入场、光标闪烁、按钮按压和 notice 等动效必须响应 `prefers-reduced-motion`；新增动效也须提供禁用规则。
- 保留中文与英文界面、键盘可达性、焦点反馈和窄窗口布局。macOS 保留原生窗口按钮，顶部栏预留其位置并提供空白拖动区域；页面铺满顶部栏下方的可用空间。

## 交付与验证

- 修改 Runtime、构建流程或关键依赖前，在 `docs/` 先完成 superseding ADR、稳定契约和实施计划，明确替代范围、依赖、所有权、风险及验收条件。普通文案、局部 UI 或小修复不机械扩展成架构重构。
- 默认由单一 Agent 实施，不因任务可拆分就自动启动子 Agent。明确要求并行时先划分文件所有权，禁止两个执行者同时修改同一文件；由单一负责人集成并做全库验证。
- 代码变更运行与影响范围匹配的类型检查、测试和构建；纯文档变更检查格式、相对链接和 whitespace，无需重跑应用构建。
- 编辑链路改动须用真实系统 WebView 验证键盘替换、退格、Enter/Esc、输入法及导出保真。浏览器 UI 模拟、粘贴成功或单元测试不能代替原生输入验收。
- UI 状态可在 Vite 预览中通过 `src/ui-state.ts` 的 `updateUI` 模拟并截图检查；HMR 后动态导入可能指向另一模块实例，状态不生效时重启开发服务。该预览不作为原生 IPC/文件能力验收。
- 报告明确区分自动测试、构建/包校验、真实桌面实测和待验证事项；macOS 的实测结果不能替代 Windows 或 Omarchy。
- 不将用户 HTML 项目、`artifacts/`、构建缓存或无关工作区修改带入提交或发布包。

## 发布约束

- npm 包、npm 根锁条目、Cargo 包与锁条目、Tauri 的版本保持一致，发布前执行 `version:check`。产品身份为 PageIn / pagein / `io.pagein.desktop`。
- 已发布标签、安装包及源码来源必须一致；默认不移动已发布标签。2026-09-18 用户明确授权本次 v0.0.1 使用当前源码替换旧标签及全部安装包，单次例外按 [ADR-008](docs/ADR-008-v0.0.1-formal-release.md) 执行，必须备份旧发布、记录完整源码 SHA 并披露替换事实，不推广为后续发布的默认规则。
- **0.0.1 按用户授权正式重发**：提供 macOS arm64 DMG/ZIP、Windows x64 NSIS `.exe`、Linux x64 AppImage 和 `.deb`。Omarchy 使用 AppImage；`.deb` 仅用于 Debian/Ubuntu，不代表扩大 Linux 实机支持承诺。
- 0.0.1 当前分发以 ADR-008 为准，ADR-007 保留历史预发布依据。正式发布状态不等于跨平台实机验收，Windows / Omarchy 桌面验证仍由用户后续执行，未获得实际证据前不得标记已验收。
- **Linux 分发形态自 2026-09-20 起改为 pacman 包与 AUR `pagein-git`**：本机 `makepkg` 出包并在 Omarchy 实机验收，AUR 只提交 PKGBUILD 与 `.SRCINFO`，不提交二进制；AppImage / deb 不再作为后续 Linux 分发形态，v0.0.1 已发布附件保持不动。详见 [ADR-013](docs/ADR-013-linux-pacman-aur-distribution.md)。
- 本地 pacman 包是验收件而非分发件。`pagein-git` 跟随上游 `main` HEAD、`pkgver` 由 git 派生，不代表任何正式版本，不得描述为已发布版本；仓库版本号在正式发版前保持 0.0.1。
- AUR 提交是对外发布行为，只在本地安装与桌面验收、干净 chroot 构建均通过后进行；提交后须用 `yay -S pagein-git` 复装验证。
- 平台附件附独立安装说明、第三方声明、manifest 和 SHA-256；保留其他平台已有校验清单，区分已签名、ad-hoc 与未签名状态。校验通过不等于代码签名、公证或目标系统启动成功。
- Windows CI 检出发布源码时保留 LF，避免 `core.autocrlf` 转换导致现有版本脚本误报。
- [.github/workflows/release-desktop.yml](.github/workflows/release-desktop.yml) 通过 `source_commit` 接受精确完整 SHA；[scripts/package-ci-release.mjs](scripts/package-ci-release.mjs) 校验其与 `EXPECTED_SOURCE_COMMIT` 一致，并固定版本 `0.0.1`。CI 仅构建 artifact，三平台包校验齐备后统一发布；新版本须显式更新版本约束。

## 依据与维护

- 项目设计记忆：`8af00702-1ed3-4754-bad5-bf67058df626`（2026-09-18 的 UI 约束与 token 结构）；导入模型记忆：`6120a6b2-817b-49e5-9c01-3781f1615f0f`。
- mise 长期约束记忆：`45b1eedf-9af9-41c3-859a-b6acfbb5b0d2`；RTK 规则继承用户级 `AGENTS.md`。
- 代码模块职责与共享操作见 [ADR-010](docs/ADR-010-codebase-simplification.md)；Linux 分发形态见 [ADR-013](docs/ADR-013-linux-pacman-aur-distribution.md) 及其[契约](docs/aur-package-contract.md)、[计划](docs/aur-package-plan.md)；Linux 全屏放映的 Esc 通路见 [ADR-012](docs/ADR-012-presentation-fullscreen-focus.md)。当前实现边界依次参考 [ADR-002](docs/ADR-002-t1-spike.md)、[ADR-003](docs/ADR-003-webkit-input-surface.md)、[ADR-004](docs/ADR-004-base-ui-shell.md)、[ADR-005](docs/ADR-005-html-presentation-projects.md) 和 [ADR-007](docs/ADR-007-cross-platform-prerelease.md)。[架构契约](docs/architecture-contract.md) 中仍有长期设计，阅读时必须结合后续 ADR 的范围收敛与替代说明。
- 当前正式重发证据见 [正式发布验收](docs/formal-release-verification.md)；[跨平台预发布验收](docs/cross-platform-release-verification.md) 保留历史记录；pacman 包与 AUR 的本地验收见 [pacman 与 AUR 验收](docs/aur-package-verification.md)。后续验证或用户决策改变时更新相关文档，不重复固化已过期结论。
