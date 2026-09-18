# 演示项目交付与验收

本轮由主 Agent 单独拥有前端、Rust、构建权限登记、测试和文档，不启用并行 Agent。共享契约见 [presentation-contract.md](presentation-contract.md)。

| 阶段         | 依赖                   | 范围与验收                                         |
| ------------ | ---------------------- | -------------------------------------------------- |
| T0 契约冻结  | ADR-005                | Opened.project、分页状态、原生命令及权限一致       |
| 展示与源映射 | T0                     | 静态 17 页可翻页，换行标题编辑不丢 br              |
| 项目导出     | T0                     | 全目录复制，覆盖/越界/链接保护测试                 |
| 原生集成     | 展示与源映射、项目导出 | build.rs / capability / handler 三处登记，构建成功 |
| 门 A         | 原生集成               | mise run check、cargo clippy、release build        |
| 门 B         | 门 A                   | 用户项目翻页、改字、导出、资源哈希、重新打开       |

主要风险为 WKWebView 事件与 HTML5 解析差异、源项目外部变动、导出遗漏资源。分别以可信输入层、源字节验证、完整文件清单与哈希核对验收。嵌套幻灯片、远程字体和任意原页面脚本不作为通过项。

2026-09-18 动效修订（单 Agent）：先更新 ADR-005 和展示契约，再由 `presentation-motion.ts` 实现内置入场及字符背景、`presentation.ts` 管理切页与清理、`main.ts` 连接放映生命周期。无新依赖或 capability。验收使用 oss-strategy-ppt 原项目 17 页，覆盖条形图、卡片、字符背景、快速前后翻页、退出恢复、减少动态效果及源哈希不变；浏览器模拟与原生 WebView 结果分开记录。
