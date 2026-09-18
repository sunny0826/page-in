# 0.0.1 发布验收

日期：2026-09-18。平台：macOS / arm64。

## 通过项

- npm、npm 锁文件、Cargo、Cargo 锁文件、Tauri 和设置页面的版本均为 0.0.1；最终应用标识为 io.pagein.desktop。
- `mise run release-macos` 完成版本检查、TypeScript、19 项前端测试、9 项 Rust 测试、release 构建和包装。
- Rust Clippy 与格式检查通过；本次源码与文档的 Git whitespace 检查通过。
- 发布暂存应用经 ad-hoc 签名，解压 ZIP 后 `codesign --verify --deep --strict` 通过；Info.plist 与资源已纳入签名。
- DMG 内含 PageIn.app、Applications 软链接和使用说明；DMG 校验通过。只读挂载后与 ZIP 解压应用逐文件比较无差异，验证后卸载映像。
- 所有 SHA256SUMS 条目核对通过；发布内容不包含 artifacts 中的用户 HTML 项目。
- 从 ZIP 解压的发布副本实际启动成功；设置中显示 PageIn 0.0.1，内置示例正常打开。

## 产物

| 文件                         |  字节数 | SHA-256                                                          |
| ---------------------------- | ------: | ---------------------------------------------------------------- |
| PageIn_0.0.1_macos-arm64.dmg | 2513732 | d481da14be0ad1cb188058af3505be2183cce8fab49ad49a21520c27c8361ecc |
| PageIn_0.0.1_macos-arm64.zip | 2117037 | c595ff13e92453ae2bde0602b97e9bcf786fadec4d01693fe651a0ff4441a2bc |

另外提供 INSTALL.txt、RELEASE-NOTES.md、THIRD-PARTY-NOTICES.txt、manifest.json、SHA256SUMS。完整文件大小、签名状态和校验值以 manifest.json 为准。

## 分发边界

未进行 Developer ID 签名或 Apple 公证；本机启动不代表下载后通过 Gatekeeper 身份检查。Intel、Windows、Linux 和自动更新不在此发布的已验证范围。GitHub 初版以 Release 草稿交付，不将草稿等同于已经公开发布。
