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

`preparePresentation` 返回 `go(index)`、`setMotionEnabled(boolean)` 与 `dispose()`。只有放映且未开启系统减少动态效果时播放；停用立即取消当前页及翻页动画、停止 Canvas 帧并恢复单页静态可见状态。同页导航不重复播放；回到此前页面重新播放。销毁时解除媒体查询监听。动画只写预览 DOM，不提交文字、增加修订或修改源文件。内置入场效果每页最多 160 个目标；字符背景每页最多 2 个 Canvas、每个最多 6000 个字符、30fps、画布最长边 2048 像素。

字符背景画布属于可信父页面，按原文档 `canvas.ascii-bg` 的实时几何位置对齐并裁剪到 iframe 边界，忽略指针、不截获输入，离开放映立即移除。不能直接向禁用脚本的 iframe Canvas 绘制并假定可见：[HTML Canvas 标准](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element)规定这时展示 fallback 内容。该覆盖层仅用于装饰字符场，不承诺与任意原始图层混合效果逐像素一致。

翻页结束通过动画 `finished` Promise 在可信父页面收尾，不依赖沙箱文档中的 `finish` 事件（系统 WKWebView 实测未触发）。过渡保留端点直到先隐藏旧页、再取消动画，避免旧页回到原位造成重叠。收尾必须幂等：快速反向翻页、退出或销毁后的旧 Promise 不得再次隐藏当前页。动画创建失败或取消也必须恢复单页可见状态，并消费 Promise 拒绝。
