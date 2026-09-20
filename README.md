# 页内 · PageIn

轻量的本地 HTML 文字编辑器。打开页面，直接修改文字，保留原有排版与样式；也可以打开 HTML 演示项目，逐页编辑并整体导出。

[版本发布](https://github.com/sunny0826/page-in/releases) · [问题反馈](https://github.com/sunny0826/page-in/issues) · [更新日志](CHANGELOG.md)

## 功能

- **原位编辑**：双击页面中的文字即可修改，支持撤销与重做。
- **保留样式**：导出时仅替换编辑过的文字，保留其余 HTML、样式和脚本。
- **演示项目**：打开项目文件夹，分页浏览幻灯片，连同图片、字体和其他资源一起导出。
- **本地处理**：文件在本机处理，预览加载项目内的样式、图片和字体。
- **放映模式**：从当前页进入原生全屏，支持内置入场动效与减少动态效果，Esc 退出。
- **简洁界面**：32px 紧凑顶部栏、macOS 原生窗口按钮、新应用图标，支持中文和 English。

## 安装

前往 [GitHub Releases](https://github.com/sunny0826/page-in/releases) 查看发布包。

0.0.1 正式版无需安装 Node.js 或 Rust。本次经维护者授权，以包含新 logo 与放映功能的当前源码替换同版本预发布；此前下载的旧包和校验和不再适用。

- **macOS 13+ / Apple Silicon**：打开 DMG，将 PageIn 拖入 Applications；也可解压 ZIP 后运行。
- **Windows x64**：运行 `.exe` 安装程序；缺少 WebView2 时安装程序会联网下载。
- **Linux x64 / Omarchy**：使用 pacman 包 `pagein-git`（AUR，跟随上游 `main` HEAD）。0.0.1 正式版曾提供 AppImage 与适用于 Debian/Ubuntu 的 `.deb`，附件保留可下载，但不再作为后续 Linux 分发形态。

Windows 和 Linux 包尚未完成对应系统的安装与功能实测。macOS 包尚未进行 Developer ID 签名和 Apple 公证，Windows 包未做代码签名。安装步骤与校验文件见 [0.0.1 发布说明](docs/releases/0.0.1.md)。

Omarchy 上的 pacman 包已完成安装、启动、文件关联、编辑与撤销重做、单文件导出、BOM/CRLF 导出、项目导出和未导出确认的实机验收，证据与待确认项见 [pacman 与 AUR 验收](docs/aur-package-verification.md)；Windows 仍待实机验证。

## 使用

1. 点击打开图标选择 HTML，或将单个 `.html` / `.htm` 拖入窗口；打开演示项目时，选择包含 `index.html` 或 `index.htm` 的文件夹。
2. 点击编辑图标，双击需要修改的文字。按 Enter 或点击空白处完成，按 Esc 取消当前输入。
3. 点击导出图标或按 ⌘S，将修改导出到新文件或新目录。原文件和原项目保持不变。

当前源码还支持系统“打开方式 → PageIn”。安装包含此功能的构建后，将 PageIn 设为 HTML 默认应用即可双击打开；应用已运行时在现有窗口打开，并提示处理未导出修改。pacman 包在安装时即注册文件关联与图标；已发布的旧安装包不会随源码更新自动获得此功能。

演示项目支持通过底部浮栏、方向键、Page Up / Down、Home / End 和滚轮翻页。打开右上角设置可切换界面语言。

### 支持范围

- HTML 文件需为 UTF-8 编码，大小不超过 5 MiB。
- 可编辑纯文本元素和独立的纯文本子元素；复杂混合内容、旋转或缩放的文字暂不支持编辑。
- 演示分页支持 `#deck` 或 `.slides` 下平级排列的 `.slide` / `section`。
- 报告预览在隔离沙箱中执行本地 JavaScript，展示 Canvas、SVG 图表与页面交互；不加载远程资源。进入编辑时冻结当前画面，原始 HTML 中可可靠定位的文字可编辑，脚本生成内容保持只读。导出仍按原文件字节应用文字补丁，保留脚本与资源引用，不保存渲染快照。PPT 沿用可信父页面的内置动效适配器。详见 [ADR-011](docs/ADR-011-isolated-live-reports.md)。
- 项目导出上限为 512 MiB、10,000 个文件和目录，不支持符号链接。

## 本地开发

项目使用 Tauri、Rust、React、TypeScript 和 Base UI。通过 [mise](https://mise.jdx.dev/) 管理开发环境，工具版本见 [mise.toml](mise.toml)。macOS 开发还需安装 Xcode Command Line Tools。

```sh
git clone https://github.com/sunny0826/page-in.git
cd page-in
mise trust
mise install
mise exec -- npm ci
mise run dev
```

运行检查与测试：

```sh
mise run check
mise exec -- cargo fmt --manifest-path src-tauri/Cargo.toml --check
mise exec -- cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

在 Apple Silicon Mac 上构建应用或生成 DMG / ZIP：

```sh
mise run build
mise run release-macos
```

安装包输出到 `releases/<版本号>-<源码SHA前12位>/`，要求已跟踪源码无未提交修改。

## 参与贡献

欢迎提交 Issue 和 Pull Request。报告问题时，请附上系统版本、复现步骤，以及可公开的最小 HTML 示例。提交代码前请运行相关检查与测试。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方依赖遵循各自的许可证。
