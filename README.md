# 页内 · PageIn

轻量的本地 HTML 文字编辑器。打开页面，直接修改文字，保留原有排版与样式；也可以打开 HTML 演示项目，逐页编辑并整体导出。

[版本发布](https://github.com/sunny0826/page-in/releases) · [问题反馈](https://github.com/sunny0826/page-in/issues) · [更新日志](CHANGELOG.md)

## 功能

- **原位编辑**：双击页面中的文字即可修改，支持撤销与重做。
- **保留样式**：导出时仅替换编辑过的文字，保留其余 HTML、样式和脚本。
- **演示项目**：打开项目文件夹，分页浏览幻灯片，连同图片、字体和其他资源一起导出。
- **本地处理**：文件在本机处理，预览加载项目内的样式、图片和字体。
- **简洁界面**：悬浮图标工具栏、macOS 原生窗口按钮，支持中文和 English。

## 安装

前往 [GitHub Releases](https://github.com/sunny0826/page-in/releases) 查看发布包。

当前提供 macOS 13 及以上版本的 Apple Silicon 构建。打开 DMG，将 PageIn 拖入 Applications；也可解压 ZIP 后运行应用。无需安装 Node.js 或 Rust。

当前安装包尚未进行 Developer ID 签名和 Apple 公证。

## 使用

1. 点击打开图标，选择 HTML 文件；打开演示项目时，选择包含 `index.html` 或 `index.htm` 的文件夹。
2. 点击编辑图标，双击需要修改的文字。按 Enter 或点击空白处完成，按 Esc 取消当前输入。
3. 点击导出图标或按 ⌘S，将修改导出到新文件或新目录。原文件和原项目保持不变。

演示项目支持通过底部浮栏、方向键、Page Up / Down、Home / End 和滚轮翻页。打开右上角设置可切换界面语言。

### 支持范围

- HTML 文件需为 UTF-8 编码，大小不超过 5 MiB。
- 可编辑纯文本元素和独立的纯文本子元素；复杂混合内容、旋转或缩放的文字暂不支持编辑。
- 演示分页支持 `#deck` 或 `.slides` 下平级排列的 `.slide` / `section`。
- 预览不执行原页面 JavaScript，也不加载远程资源；依赖脚本生成的内容或动画无法在预览中运行。导出保留原始脚本与资源引用。
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

安装包输出到 `releases/<版本号>/`。

## 参与贡献

欢迎提交 Issue 和 Pull Request。报告问题时，请附上系统版本、复现步骤，以及可公开的最小 HTML 示例。提交代码前请运行相关检查与测试。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方依赖遵循各自的许可证。
