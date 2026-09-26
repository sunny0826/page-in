# 编辑正确性修复契约

依据 [ADR-014](ADR-014-edit-transaction-fidelity.md)。本文件为并行修复 T0 冻结基线。

## 数据与 IPC

`TextEntry` 保留现有 nodeId、startByte、endByte、raw、originalDecoded、domPath、tag，新增可选字段：

```ts
textContext?: 'html' | 'pre-leading';
```

Rust Entry 接受同名 camelCase 字段，缺省为 html，未知枚举值拒绝。pre-leading 只表示源区间从 pre/listing 起始标签结束处开始，前面不存在原文件保留的、会被 HTML 解析器忽略的 LF。解析器负责从真实源位置和父元素识别该标记；核心继续校验源区间、UTF-8 边界、raw、节点 ID、会话和修订。raw-text 元素及后代不进入清单，包括正文中可显示的 noframes。

核心只对修改区间编码：普通转义规则不变；pre-leading 的新文字以 LF 开头时，在转义结果前补一个 LF。无修改及恢复原文时仍逐字节返回原始区间。所有补偿都发生于已验证补丁范围内，禁止改写区间外字节。

若补丁前一个原始字节为 CR，且新文字以 LF 开头，将新文字的第一个 LF 编码为 `&#10;`，防止跨补丁边界合并成 CRLF。这也覆盖 pre/listing 已保留一个被忽略的单独 CR 的情况；保留原始 CR，不额外添加前导换行。此修订由共同夹具发现的反例触发，于 2026-09-26 在核心实现前冻结。

OpenedDocument、SessionView、commit_edit、undo_edit、redo_edit、export_document 的参数和结果保持不变。前端预检与核心保持相同的 1 MiB UTF-8 字节限制及 NUL 限制；前端检查不能代替核心校验。

## 输入事务

适配当前 main 的动态报告：input-surface 仅负责事件接线，复用已验证的控制器与事务；动态报告的渲染投影和快照克隆序列化均须补偿 pre/listing 首 LF，不修改实际 live DOM。已确认的空文字经预览和快照序列化后可能没有 Text 子节点，只有唯一源 marker、tag、namespace、期望空值均匹配时才重建空 Text 节点，不注册新源区间、不允许生成文字回写。

- 映射文字写入须保留 Text 节点，空字符串仍可进入编辑；空片段命中区域只属于临时预览，不能增加导出文字。
- 提交期间只存在一个生效中的事务；重复 finish 复用同一提交，输入不能在快照提交中悄悄产生未确认变更。
- 成功后才释放输入层与缓冲；失败恢复可编辑的新输入，核心 revision/dirty 不伪造成功。后续打开、导出、关闭不能越过失败的 finish。
- Esc 取消尚未确认的输入并恢复已确认值；切换元素、失焦、预览、放映、历史和导出沿用串行边界。输入法组合期不能误提交候选或破坏最后一次 input。
- 在 begin 的异步等待后重新确认目标会话、模式和元素仍有效，防止过期 begin 创建孤立输入层。
- 元素和祖先的独立 CSS translate/rotate/scale 与 transform 一并检查，不支持的几何保持只读。复制样式继续排除 -webkit-user-modify，焦点和选框沿用已有 token。

## 验证与风险

生产函数测试覆盖清空/重编、失败/重试/取消、重复提交、UTF-8/NUL、独立变换和祖先变换。解析与 Rust 导出共同覆盖普通文本、raw-text 只读、pre/listing 首换行、有无原始 LF/CRLF/单独 CR、Unicode、实体和恢复原文。

mock/DOM 测试只证明指定逻辑，不代替系统 WebView 的键盘、输入法和原生导出。替代方案和兼容性取舍见 ADR-014；如需要改变本契约，worker 先报告，由主 Agent 更新后再继续。
