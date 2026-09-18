export type Locale = "zh" | "en";
export const localeKey = "pagein.locale.v1";
export function readLocale(storage?: Pick<Storage, "getItem">): Locale {
  try {
    return storage?.getItem(localeKey) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
function loadLocale(): Locale {
  try {
    return readLocale(localStorage);
  } catch {
    return "zh";
  }
}
let locale = loadLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setLocale(next: Locale) {
  locale = next;
  try {
    localStorage.setItem(localeKey, next);
  } catch {
    /* Still usable without storage. */
  }
  if (typeof document !== "undefined")
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  listeners.forEach((listener) => listener());
}
const messages = {
  dragWindow: ["拖动窗口", "Move window"],
  local: ["本地 HTML 编辑器", "Local HTML editor"],
  eyebrow: ["文字的小改动，留在页面里。", "Small edits, right on the page."],
  headline: ["打开页面，", "Open a page."],
  headlineEnd: ["把文字改好。", "Make it yours."],
  intro: [
    "不必翻找源代码。直接在页面里修改文字，让熟悉的排版，保持原来的样子。",
    "Edit text right where it belongs. Keep the layout you love, without digging through source code.",
  ],
  open: ["打开 HTML", "Open HTML"],
  openProject: ["打开项目文件夹", "Open project folder"],
  openChoice: ["打开文件或项目", "Open a file or project"],
  openChoiceBody: ["选择单个 HTML，或包含 index.html 的项目文件夹。项目将连同资源一起导出。", "Choose an HTML file or a project folder containing index.html. Projects export together with their resources."],
  exportProject: ["整体导出项目", "Export entire project"],
  previousSlide: ["上一页", "Previous slide"],
  nextSlide: ["下一页", "Next slide"],
  slides: ["演示文稿分页", "Presentation navigation"],
  present: ["开始放映", "Start slideshow"],
  exitPresentation: ["退出放映", "Exit slideshow"],
  presentationHint: ["Esc 退出放映", "Esc to exit slideshow"],
  fullscreenTimeout: ["全屏切换未完成，请重试", "Fullscreen did not finish switching. Please try again."],
  documentFormat: ["文档类型", "Document type"],
  reportFormat: ["报告", "Report"],
  presentationFormat: ["PPT", "PPT"],
  reportFormatHint: ["报告 · 连续阅读的 HTML 页面", "Report · Continuous HTML page"],
  presentationFormatHint: ["PPT · HTML 演示文稿", "PPT · HTML presentation"],
  opening: ["正在打开…", "Opening…"],
  sample: ["试试示例页面", "Try a sample"],
  fileNote: [
    "支持 .html / .htm · 原文件始终保留",
    ".html / .htm · Your original stays untouched",
  ],
  demoTitle: ["让好想法，", "Good ideas,"],
  demoEnd: ["多一点可能。", "a little clearer."],
  demoStyle: ["保持原有样式", "Keep your design"],
  demoTag: ["在这里，直接修改", "Edit right here"],
  steps: ["使用步骤", "How it works"],
  stepOpen: ["打开文件", "Open a file"],
  stepOpenBody: ["选择或拖入电脑里的 HTML", "Choose or drop an HTML file"],
  stepEdit: ["双击改字", "Double-click to edit"],
  stepEditBody: ["在页面原位置直接输入", "Type directly on the page"],
  stepExport: ["导出新文件", "Export a new file"],
  stepExportBody: ["带着原有排版，继续使用", "Keep the layout and carry on"],
  privacy: ["文件留在本机，编辑更安心", "Your files stay on your computer"],
  footer: ["只改文字，保留设计。", "Change the words. Keep the design."],
  edit: ["编辑文字", "Edit text"],
  toolbar: ["页面编辑工具", "Page editing tools"],
  busy: ["处理中…", "Working…"],
  dirty: ["有未导出的修改", "Unexported changes"],
  clean: ["未修改 / 已导出", "Unchanged / exported"],
  undo: ["撤销", "Undo"],
  redo: ["重做", "Redo"],
  preview: ["预览", "Preview"],
  export: ["导出修改版", "Export edited HTML"],
  openNew: ["打开新文件", "Open another file"],
  settings: ["设置", "Settings"],
  settingsBody: [
    "管理界面语言，查看当前运行状态。",
    "Choose your interface language and view session details.",
  ],
  language: ["界面语言", "Interface language"],
  languageBody: [
    "立即生效，下次打开时保留。",
    "Applies immediately and is remembered next time.",
  ],
  diagnostics: ["诊断信息", "Diagnostics"],
  version: ["应用版本", "App version"],
  noFile: ["尚未打开文件", "No file open"],
  file: ["当前文件", "Current file"],
  fragments: ["可编辑片段", "Editable fragments"],
  parse: ["文件解析耗时", "Parsing time"],
  startup: ["本次启动耗时", "This launch"],
  sandbox: ["页面隔离", "Page isolation"],
  sandboxBody: ["原文件脚本已禁用", "Original scripts are disabled"],
  engine: ["浏览器引擎", "Browser engine"],
  hint: ["双击文字开始编辑", "Double-click text to edit"],
  done: ["完成", "Done"],
  cancel: ["取消", "Cancel"],
  close: ["关闭", "Close"],
  dismiss: ["关闭提示", "Dismiss notification"],
  changed: [
    "该片段的结构已变化，未进入编辑",
    "This fragment has changed structure and cannot be edited.",
  ],
  transform: [
    "暂不支持编辑带变换或竖排的文字",
    "Transformed or vertical text cannot be edited yet.",
  ],
  plainOnly: [
    "仅支持编辑纯文本元素；可双击独立的加粗或链接文字",
    "Only plain-text elements can be edited. Try an individual bold or linked text fragment.",
  ],
  parseTimeout: [
    "解析超时，未修改原文件",
    "Parsing timed out. The original file is unchanged.",
  ],
  renderTimeout: ["页面渲染超时", "The page took too long to render."],
  frameUnavailable: ["无法访问页面内容", "The page content is unavailable."],
  support: ["文件已打开 · 支持范围", "File opened · Compatibility"],
  mapping: [
    "{count} 个片段无法可靠映射，已保持只读。",
    "{count} fragments could not be mapped reliably and remain read-only.",
  ],
  exported: ["已导出：{path}", "Exported: {path}"],
  unsaved: ["保留这次修改吗？", "Keep your changes?"],
  unsavedBody: [
    "还有文字修改尚未导出。导出后再继续，或放弃本次修改；原 HTML 文件始终保留。",
    "Some edits have not been exported. Export them before continuing, or discard these changes. Your original HTML is always preserved.",
  ],
  discard: ["放弃修改", "Discard changes"],
  exportContinue: ["导出后继续", "Export and continue"],
  htmlPage: ["HTML 页面", "HTML page"],
} as const;
export type MessageKey = keyof typeof messages;
export function t(
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  return messages[key][locale === "zh" ? 0 : 1].replace(
    /\{(\w+)\}/g,
    (match, name: string) => String(values[name] ?? match),
  );
}

// Shared parser/native errors remain stable; translate them only at the UI boundary.
const errorMessages: Record<string, string> = {
  "请一次只打开一个 HTML 文件": "Please open one HTML file at a time.",
  "打开请求已失效": "This open request has expired.",
  "打开请求过多，请稍后重试": "Too many open requests. Please try again shortly.",
  "项目文件夹中需要有 index.html 或 index.htm": "The project folder must contain index.html or index.htm.",
  "原 HTML 已被外部修改，请重新打开项目后再导出": "The original HTML changed outside PageIn. Reopen the project before exporting.",
  "项目目录层级过深": "The project directory tree is too deep.",
  "项目最多包含 10,000 个文件和目录": "Projects can contain at most 10,000 files and directories.",
  "项目导出上限为 512 MiB": "Project exports are limited to 512 MiB.",
  "导出只创建新目录，请使用一个未存在的目录名": "Export creates a new folder. Choose a folder name that does not exist.",
  "请将项目导出到原项目之外的新文件夹": "Export to a new folder outside the original project.",
  "最多处理 50,000 个节点": "Files can contain at most 50,000 nodes.",
  "只支持 UTF-8；该文件声明了其他编码，未修改原文件":
    "Only UTF-8 is supported. This file declares another encoding; the original is unchanged.",
  "外部或越界 base 不受支持":
    "External or out-of-directory base URLs are not supported.",
  没有找到可安全编辑的纯文本元素:
    "No safely editable plain-text elements were found.",
  "只打开不超过 5 MiB 的 HTML 文件":
    "Choose an HTML file no larger than 5 MiB.",
  "请选择 HTML 文件": "Please choose an HTML file.",
  "导出只创建新文件，请使用一个未存在的文件名":
    "Export creates a new file. Please choose a filename that does not exist.",
  "暂不打开超过 5 MiB 的文件": "Files larger than 5 MiB are not supported.",
  "UnsupportedEncoding：只支持有效 UTF-8 HTML":
    "Only valid UTF-8 HTML is supported.",
  "不支持含 NUL 的文件": "Files containing NUL characters are not supported.",
  "清单已登记，不能重新定义源区间":
    "This document is already registered; its source ranges cannot be redefined.",
  文本节点过多: "The file contains too many text nodes.",
  文字过长或含不支持字符:
    "The text is too long or contains unsupported characters.",
};
export function localizeError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  if (locale === "en" && message.startsWith("项目包含不支持的链接或特殊文件：")) {
    return message.replace("项目包含不支持的链接或特殊文件：", "The project contains an unsupported link or special file: ");
  }
  return locale === "en" ? (errorMessages[message] ?? message) : message;
}
