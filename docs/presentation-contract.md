# 演示项目接口契约

沿用 [ADR-005](ADR-005-html-presentation-projects.md) 的静态分页方案。Rust 是源文件与修订号的权威；React 只负责图标控件，presentation.ts 只改变临时 DOM。

| 接口            | 输入                                                   | 返回 / 行为                                  |
| --------------- | ------------------------------------------------------ | -------------------------------------------- |
| open_project    | locale                                                 | 原生选择目录，返回 Opened 或取消 null        |
| Opened          | sessionId / filename / source / resourceBase / project | project 区分整体目录导出与单文件导出         |
| export_document | sessionId / expectedRevision / locale                  | 项目模式导出新目录；单文件模式沿用 HTML 导出 |
| ShellState      | project / slideIndex / slideCount                      | 索引从 0 开始，普通文档页数为 0              |

open_project 必须同时登记在 build.rs、invoke_handler 和 main capability。其他提交、撤销与修订校验接口不变。目录拷贝使用新建目标，失败不能标记会话为已导出。入口在外部发生变化时拒绝导出，避免把旧文本补丁套在新源文件上。

不使用任意脚本执行或 DOM 序列化保存，代价是动态生成内容不受支持；演示控制样式和包装标签不得进入导出。
