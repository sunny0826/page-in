# PageIn 应用图标

当前母版：[app-icon.png](../app-icon.png)。桌面资源位于 [src-tauri/icons](../src-tauri/icons/)，网页 favicon 复用其中的 `32x32.png`。

设计使用深绿底板、暖白折角纸页和文字插入光标，呼应本地 HTML 原位文字编辑。透明边缘保留生成结果的 alpha。根目录 `app-icon.svg` 为旧版设计，当前应用不再引用。

生成方式：2026-09-18 使用内置 image_gen 工具。用户指定 gpt-image-2.5，但工具不提供模型选择参数，亦未返回可核实的模型版本；未使用 CLI/API 回退。原始输出为 1254 × 1254 PNG。

## 完整生成提示词

```text
Use case: logo-brand
Asset type: production desktop application icon for PageIn, a lightweight local HTML in-place text editor that preserves the original page.
Primary request: Design one distinctive, beautifully resolved, minimalist app icon combining a sheet of paper and an insertion caret. A warm ivory upright page with a quietly folded upper-right corner sits centered on a deep forest-green rounded-square tile. Inside the page, two or three short bold green text strokes and one clear green insertion caret form a subtle abstract P composition. Make the mark feel editorial, calm, precise and approachable.
Style/medium: refined geometric graphic design, mostly flat with a very subtle paper-layer relief, crisp edges, optically balanced large shapes. Not a photorealistic object. High-end restrained macOS productivity app aesthetic.
Color palette: deep forest green #405d40 / #334d34, warm ivory #fffffc / #f7f8f5, optional small sage accent #99ad84, matching the project's existing UI.
Composition/framing: exactly one icon, straight-on, square 1024x1024 canvas. Rounded-square tile occupies about 90% of canvas width with even transparent margins. Central paper/caret emblem bold enough to read at 32px, about 58% of canvas width. Real alpha transparency outside the tile, no background plane.
Constraints: no product name, no words, no letter labels, no watermark, no surrounding objects, no mockup scene, no icon sheet, no alternate concepts, no border frame. Avoid tiny detail, thin lines, glossy plastic, exaggerated 3D, busy gradients, pencil symbols, generic arrows, code brackets. Return the actual standalone usable icon asset.
```

## 派生桌面资源

使用项目已安装的 Tauri CLI 转换格式和尺寸，不修改母版内容：

```sh
rtk proxy mise exec -- npm run tauri -- icon app-icon.png --output artifacts/pagein-icon-generated
rtk proxy sh -c 'cp artifacts/pagein-icon-generated/*.png artifacts/pagein-icon-generated/*.ico artifacts/pagein-icon-generated/*.icns src-tauri/icons/'
```

仅同步桌面 PNG、ICNS、ICO；生成器额外输出的移动端资源留在忽略目录。图标派生不直接更新发行包；后续正式重发按 [ADR-008](ADR-008-v0.0.1-formal-release.md) 执行。
