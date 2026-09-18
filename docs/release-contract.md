# 0.0.1 发布契约

依据 [ADR-006](ADR-006-first-release.md)，本次只改变版本、产品元信息和包装流程，不改变编辑事务接口或增加文档权限。

| 项目     | 约定                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| 版本     | package.json、npm 根锁条目、Cargo 包及锁条目、Tauri version 完全一致          |
| 身份     | PageIn / pagein / io.pagein.desktop                                           |
| 平台     | macOS 13+，arm64；包名明确标注 macos-arm64                                    |
| UI 版本  | Vite 从 package.json 注入，设置中的诊断信息显示                               |
| 打包输入 | 最新 release PageIn.app、发布说明和组件声明；不拷贝 artifacts 下用户文档      |
| 输出     | releases/0.0.1 下 DMG、ZIP、说明、manifest.json、SHA256SUMS                   |
| 签名     | 对暂存应用做 ad-hoc 签名和 strict verify；未提供 Developer ID 或 notarization |
| 冲突     | 已有同版本输出目录时拒绝覆盖                                                  |

原有源码保存规则和沙箱策略保持有效。发布脚本根据实际 Mach-O 架构与 Info.plist 校验包内容，不根据文件名假定架构或版本正确。发布说明明确能力边界，校验和只证明文件一致性，不替代开发者身份签名。
