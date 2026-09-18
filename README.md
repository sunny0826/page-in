# 页内 · PageIn

本地 HTML 文字编辑器。目标平台为 macOS、Windows、Omarchy；当前可用性以随附验证报告为准。

当前版本 **0.0.1**，首版提供 macOS 13+ / Apple Silicon 构建。下载与发布状态见 [GitHub Releases](https://github.com/sunny0826/page-in/releases)，功能与限制见 [0.0.1 发布说明](docs/releases/0.0.1.md)。当前包使用 ad-hoc 签名，尚未进行 Developer ID 签名和 Apple 公证。

应用界面使用 Base UI 1.8.0 与 React 19.3.0：欢迎页、图标工具栏、设置、提示与模态弹窗。设置中可即时切换中文 / English，并在本机记住语言选择；诊断信息也位于设置中。所有应用操作按钮只显示图标，悬停提示和无障碍名称说明用途。采用本地 CSS 和系统字体，不请求外部字体或样式；导入的 HTML 保持自己的样式和文字。组件边界见 [ADR-004](docs/ADR-004-base-ui-shell.md)，验证记录见 [Base UI 验证记录](docs/base-ui-verification.md)。

macOS 隐藏标题文字及独立顶栏，仅保留原生红黄绿按钮；HTML 铺满整个窗口，不预留顶部高度。右上角操作栏独立悬浮，高约 30px，图标按钮为 24px。浮栏左侧的小拖柄可拖动窗口，双击遵循系统窗口缩放行为。

预览滚动条宽 8px，使用圆角滑块，并根据文件背景与文字颜色调整轨道和滑块配色；样式只注入预览副本，不进入导出的 HTML。

## 本阶段可以做什么

- 原生对话框打开 UTF-8 HTML，完整页面预览，右上角提供编辑、打开新文件和设置图标。
- 进入编辑后双击纯文本元素，在同位置的可信输入层修改，导出保留原样式；Enter / 点击空白完成，Esc 取消当前输入。
- 会话内撤销、重做；导出一个新的 HTML，不覆盖原文件或任何已有文件。
- 本地同目录 CSS、图片、字体通过受限资源协议加载，远程资源不加载。
- 原文件脚本在编辑器内不运行；导出仍保留原始脚本和其他未修改内容。

## HTML 演示项目

点击打开图标，在弹窗中选择文件夹图标，打开包含 `index.html`（或 `index.htm`）的项目目录。入口文件中 `#deck`、`.slides` 下的平级 `.slide` / `section` 页面会进入分页模式：底部紧凑浮栏翻页，也支持方向键、Page Up / Down、Home / End 和滚轮。含 `<br>` 的标题可以逐行双击编辑，换行标签会保留。

项目模式中的导出图标（或 ⌘S）会创建一个新的完整目录：修改写入入口 HTML，其他 HTML、脚本、样式、图片和子目录按原结构复制。原项目保持不变；目录名必须未被使用，目标必须位于原项目之外。普通单 HTML 模式仍导出单文件。

预览使用静态分页，不运行项目自带的 JavaScript、WebGL 动画或远程字体；导出保留这些原始代码与地址。仅由 JavaScript 动态生成内容、嵌套纵向幻灯片和任意 CSS 变换的文字编辑暂不支持。文件夹入口限制 5 MiB，整体导出限制 512 MiB / 10,000 个文件和目录；遇到符号链接或特殊文件会明确拒绝导出，不会静默遗漏资源。

**尚未实现：** SQLite 持久历史版本、跨重启草稿恢复、任意混合父元素的文字编辑。此阶段使用“导出修改版”，不将其称为已保存的历史版本。

输入限制为 5 MiB、有效 UTF-8、最多 50,000 个节点。非 UTF-8、需要脚本生成的页面、iframe 内页面不属于当前版本支持范围。混合父元素保持只读，但其独立纯文本子元素（例如 `<strong>小明</strong>`）可编辑。

## 环境与运行

先安装 mise；macOS 还需要已完成许可确认的 Xcode/Command Line Tools。Node 与 Rust 版本唯一来源为 `mise.toml`，npm 和 Cargo 的依赖使用锁文件。

```sh
mise trust
mise install
mise exec -- npm ci
mise exec -- npm run tauri dev
```

开发服务器仅用于开发。Release 应用没有 localhost 监听服务，不携带 Node 或浏览器内核。

```sh
mise exec -- npm run typecheck
mise exec -- npm test
mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml --check
mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
mise exec -- cargo test --manifest-path src-tauri/Cargo.toml
mise exec -- npm run tauri build -- --bundles app
mise exec -- node scripts/sizes.mjs
```

最后一条打包命令仅用于 macOS。Windows 需安装 Microsoft C++ 构建工具与 WebView2，并显式选择 Windows bundle 目标；Omarchy 需系统 `webkit2gtk-4.1` 等构建依赖，先用 `tauri build --no-bundle` 验证原生运行。Omarchy 的 PKGBUILD 与 Windows 安装产物待对应实机验证后再补齐，当前未提供未经验证的安装包。

本项目不要求终端用户安装 Rust 或 Node。Developer ID 签名、公证与其他平台验收属于后续阶段。

## 准备 macOS 发布包

在 Apple Silicon Mac 上运行 `mise run release-macos`，依次执行版本检查、回归测试、应用构建、ad-hoc 签名、DMG / ZIP 包装与校验。输出位于 `releases/<版本号>/`；已有同版本目录时拒绝覆盖。发布流程不会打包 `artifacts/` 中的本地验证文档。

DMG 和 ZIP 包含相同的 PageIn.app；`SHA256SUMS` 可用 `shasum -a 256 -c SHA256SUMS` 核对。包内组件声明来自当前安装的 npm / Cargo 依赖。分发前仍需区分 ad-hoc 完整性签名与正式开发者签名。

## 关键文件

- `src/parser.ts`：HTML5 解析、受限渲染副本、文本源位置映射。
- `src/main.ts`：单窗口悬浮工具与原位文字事务。
- `src/shell.tsx` / `src/ui-state.ts`：Base UI 外壳、状态快照与动作桥接。
- `src-tauri/src/document.rs`：不可变源文件、文字补丁、撤销与导出构建。
- `src-tauri/src/resources.rs`：资源类型与目录路径检查。
- `src-tauri/src/main.rs`：原生文件选择、IPC、资源协议和窗口生命周期。
- `tests/fixtures/`：自包含、本地资源、混合标签与脚本验证样本。
- `docs/ADR-002-t1-spike.md`：本阶段边界、相对完整架构的缩小范围。

原文是保存依据，渲染 DOM 不是。变更只替换已登记文本区间，保留其他原始字节。Release 不包含调试服务器、source map 或浏览器二进制。

WKWebView 的沙箱事件限制与输入层适配见 [ADR-003](docs/ADR-003-webkit-input-surface.md)。旋转、缩放、竖排节点保持只读；自定义字体、伪元素和复杂嵌套滚动的输入外观尚未验收。
