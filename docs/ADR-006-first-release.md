# ADR-006：0.0.1 首版交付

日期：2026-09-18。

## 决策

0.0.1 先交付已实机验证的 macOS 13+ / Apple Silicon 版本。版本号在 npm、Cargo、Tauri 与锁文件保持一致；正式标识使用 io.pagein.desktop，npm 包名使用 pagein。部分取代 ADR-002 的「仅本机构建、不准备分发产物」阶段边界，源文件不可变、静态沙箱、资源目录约束及未验证平台限制保持有效。

提供 DMG、保留应用元数据的 ZIP、中文发布说明、第三方组件声明和 SHA-256 校验文件。没有可用 Developer ID 证书，因此仅使用 ad-hoc 签名封装资源，不宣称通过 Apple 公证或 Gatekeeper。用户指定了空仓库 sunny0826/page-in，初始化 main 源码，并准备带附件的 GitHub Release 草稿。

## 替代方案与风险

- 直接称为已正式公开发布：缺少分发目的地和 Developer ID，不采用。
- 同时交付所有平台或 Universal 包：Intel、Windows、Linux 尚未实机验收，不扩大首版承诺。
- 使用 Finder 自动布局 DMG：改用 hdiutil 从独立暂存目录生成磁盘映像，减少 UI 自动化和后台 Finder 状态依赖。
- 包标识从 io.pagein.spike 改为 io.pagein.desktop，会使用新的应用身份，旧预览版的语言偏好可能需要重选；原始文档不受影响。

验收必须覆盖版本一致、28 项回归、Rust 静态检查、构建、签名完整性、归档内容、DMG 校验及发布副本启动。
