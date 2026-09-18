import { useSyncExternalStore, type PointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { getLocale, setLocale, subscribeLocale, t } from "./i18n.ts";
import { Separator } from "@base-ui/react/separator";
import { Tooltip } from "@base-ui/react/tooltip";
import { FileTextIcon } from "@phosphor-icons/react/dist/csr/FileText";
import { FolderSimpleIcon } from "@phosphor-icons/react/dist/csr/FolderSimple";
import { MonitorPlayIcon } from "@phosphor-icons/react/dist/csr/MonitorPlay";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUUpLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowUUpLeft";
import { ArrowUUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUUpRight";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { ExportIcon } from "@phosphor-icons/react/dist/csr/Export";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/csr/PlayCircle";
import {
  dismissDialog,
  getUI,
  subscribeUI,
  updateUI,
  type ShellActions,
} from "./ui-state.ts";

// Keep all shell icons in the same Phosphor Regular family.
const icons = {
  file: FileTextIcon,
  project: FolderSimpleIcon,
  present: MonitorPlayIcon,
  previous: CaretLeftIcon,
  next: CaretRightIcon,
  open: FolderOpenIcon,
  edit: PencilSimpleIcon,
  arrow: ArrowRightIcon,
  undo: ArrowUUpLeftIcon,
  redo: ArrowUUpRightIcon,
  eye: EyeIcon,
  export: ExportIcon,
  more: DotsThreeIcon,
  close: XIcon,
  info: InfoIcon,
  shield: ShieldCheckIcon,
  settings: GearSixIcon,
  check: CheckIcon,
  trash: TrashIcon,
  sample: PlayCircleIcon,
} as const;
type IconName = keyof typeof icons;
function Icon({ name }: { name: IconName }) {
  const Component = icons[name];
  return <Component className="icon" size={18} weight="regular" aria-hidden="true" focusable="false" />;
}
function keepInputFocus(event: PointerEvent) {
  // Pointer actions finish input explicitly; keyboard users retain normal focus.
  if (getUI().activeInput) event.preventDefault();
}
function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  shortcut,
  variant = "",
  danger = false,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  variant?: "primary" | "secondary" | "";
  danger?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            className={`button icon-button ${variant}${danger ? " danger" : ""}`}
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            onPointerDown={keepInputFocus}
          />
        }
      >
        <Icon name={icon} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="bottom"
          sideOffset={10}
          className="tooltip-positioner"
        >
          <Tooltip.Popup className="tooltip">
            {label}
            {shortcut && <kbd>{shortcut}</kbd>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function Welcome({ actions, busy }: { actions: ShellActions; busy: boolean }) {
  return (
    <main className="welcome" aria-busy={busy}>
      <section className="welcome-main">
        <div className="intro">
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1>
            {t("headline")}
            <br />
            <span className="accent">{t("headlineEnd")}</span>
          </h1>
          <p>{t("intro")}</p>
          <div className="welcome-actions">
            <ToolButton
              label={t(busy ? "opening" : "open")}
              icon="open"
              variant="primary"
              onClick={actions.open}
              disabled={busy}
            />
            <ToolButton
              label={t("sample")}
              icon="sample"
              variant="secondary"
              onClick={actions.sample}
              disabled={busy}
            />
          </div>
          <span className="file-note">{t("fileNote")}</span>
        </div>
        <div className="page-demo" aria-hidden="true">
          <div className="demo-browser">
            <div className="window-dots">
              <i />
              <i />
              <i />
            </div>
            <span>your-page.html</span>
            <Icon name="shield" />
          </div>
          <div className="demo-page">
            <div className="demo-label">A LITTLE CHANGE</div>
            <div className="demo-title">
              {t("demoTitle")}
              <br />
              <span>
                {t("demoEnd")}
                <span className="demo-caret" />
              </span>
            </div>
            <div className="demo-line" />
            <div className="demo-line short" />
            <div className="demo-bottom">
              <span className="demo-pill">{t("demoStyle")}</span>
              <span>01 — 03</span>
            </div>
          </div>
          <div className="demo-tag">
            <Icon name="edit" />
          </div>
        </div>
      </section>
      <section className="steps" aria-label={t("steps")}>
        {[
          ["01", t("stepOpen"), t("stepOpenBody")],
          ["02", t("stepEdit"), t("stepEditBody")],
          ["03", t("stepExport"), t("stepExportBody")],
        ].map(([number, title, description]) => (
          <div className="step" key={number}>
            <span className="step-number">{number}</span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </section>
      <footer className="welcome-footer">
        <span>
          <Icon name="shield" />
          {t("privacy")}
        </span>
        <span>{t("footer")}</span>
      </footer>
    </main>
  );
}
function Settings({ state }: { state: ReturnType<typeof getUI> }) {
  const data = state.diagnostics;
  return (
    <Dialog.Root
      open={state.settingsOpen}
      onOpenChange={(settingsOpen) => updateUI({ settingsOpen })}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup settings-page">
          <div className="dialog-header">
            <span className="dialog-symbol">
              <Icon name="settings" />
            </span>
            <ToolButton
              label={t("close")}
              icon="close"
              onClick={() => updateUI({ settingsOpen: false })}
            />
          </div>
          <Dialog.Title className="dialog-title">{t("settings")}</Dialog.Title>
          <Dialog.Description className="dialog-body">
            {t("settingsBody")}
          </Dialog.Description>
          <section className="settings-section">
            <fieldset className="language-field">
              <legend>{t("language")}</legend>
              <p>{t("languageBody")}</p>
              <div className="language-options">
                {(
                  [
                    ["zh", "中文"],
                    ["en", "English"],
                  ] as const
                ).map(([locale, label]) => (
                  <label className="language-option" key={locale}>
                    <input
                      type="radio"
                      name="language"
                      value={locale}
                      checked={getLocale() === locale}
                      onChange={() => setLocale(locale)}
                    />
                    <span lang={locale === "zh" ? "zh-CN" : "en"}>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <section
            className="settings-section"
            aria-labelledby="diagnostics-title"
          >
            <h2 id="diagnostics-title">
              <Icon name="info" />
              {t("diagnostics")}
            </h2>
            <dl className="diagnostics-list">
              <div>
                <dt>{t("version")}</dt>
                <dd>PageIn {__APP_VERSION__}</dd>
              </div>
              <div>
                <dt>{t("file")}</dt>
                <dd>{data?.filename ?? t("noFile")}</dd>
              </div>
              <div>
                <dt>{t("fragments")}</dt>
                <dd>
                  {data?.editable ?? 0} / {data?.total ?? 0}
                </dd>
              </div>
              <div>
                <dt>{t("parse")}</dt>
                <dd>{data?.parseMs.toFixed(1) ?? "0.0"} ms</dd>
              </div>
              <div>
                <dt>{t("startup")}</dt>
                <dd>{data?.startupMs.toFixed(1) ?? "0.0"} ms</dd>
              </div>
              <div>
                <dt>{t("sandbox")}</dt>
                <dd>{t("sandboxBody")}</dd>
              </div>
              <div className="diagnostic-engine">
                <dt>{t("engine")}</dt>
                <dd>{data?.engine}</dd>
              </div>
            </dl>
          </section>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function WindowGrip() {
  return (
    <span
      className="titlebar-drag-region"
      data-tauri-drag-region
      aria-hidden="true"
      title={t("dragWindow")}
    />
  );
}
function Shell({ actions }: { actions: ShellActions }) {
  const state = useSyncExternalStore(subscribeUI, getUI);
  useSyncExternalStore(subscribeLocale, getLocale);
  const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <Tooltip.Provider delay={450}>
      {!state.filename ? (
        <>
          <Welcome actions={actions} busy={state.busy} />
          <div className="titlebar" hidden={state.presenting}>
            <WindowGrip />
            <div
              className="editor-toolbar"
              role="group"
              aria-label={t("toolbar")}
            >
              <ToolButton
                label={t("openNew")}
                icon="open"
                onClick={actions.open}
                disabled={state.busy}
              />
              <ToolButton
                label={t("settings")}
                icon="settings"
                onClick={actions.settings}
                disabled={state.busy}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="titlebar" hidden={state.presenting}>
            <WindowGrip />
            <div
              className={
                state.editing
                  ? "editor-toolbar"
                  : "editor-toolbar preview-toolbar"
              }
              role="group"
              aria-label={t("toolbar")}
              aria-busy={state.busy}
            >
              {state.documentFormat && (
                <span
                  className="document-format"
                  title={t(state.documentFormat === "presentation" ? "presentationFormatHint" : "reportFormatHint")}
                  aria-label={`${t("documentFormat")}: ${t(state.documentFormat === "presentation" ? "presentationFormatHint" : "reportFormatHint")}`}
                >
                  {t(state.documentFormat === "presentation" ? "presentationFormat" : "reportFormat")}
                </span>
              )}
              <div
                className="document-status"
                title={`${state.filename} · ${t(state.busy ? "busy" : state.dirty ? "dirty" : "clean")}`}
              >
                <span
                  className={`status-dot ${state.dirty ? "dirty" : ""} ${state.busy ? "pending" : ""}`}
                />
                <div>
                  <span className="filename" title={state.filename}>
                    {state.filename}
                  </span>
                  <span className="save-status" role="status">
                    {t(
                      state.busy ? "busy" : state.dirty ? "dirty" : "clean",
                    )}
                  </span>
                </div>
              </div>
              <Separator
                orientation="vertical"
                className="toolbar-separator"
              />
              {state.editing ? (
                <>
                  <ToolButton
                    label={t("undo")}
                    icon="undo"
                    shortcut={`${mod}Z`}
                    onClick={actions.undo}
                    disabled={
                      state.busy || (!state.canUndo && !state.activeInput)
                    }
                  />
                  <ToolButton
                    label={t("redo")}
                    icon="redo"
                    shortcut={`⇧${mod}Z`}
                    onClick={actions.redo}
                    disabled={state.busy || !state.canRedo}
                  />
                  <ToolButton
                    label={t("preview")}
                    icon="eye"
                    onClick={actions.preview}
                    disabled={state.busy}
                  />
                  <ToolButton
                    label={t(state.project ? "exportProject" : "export")}
                    icon="export"
                    variant="primary"
                    onClick={actions.exportFile}
                    disabled={state.busy}
                  />
                  <Separator
                    orientation="vertical"
                    className="toolbar-separator"
                  />
                </>
              ) : (
                <ToolButton
                  label={t("edit")}
                  icon="edit"
                  onClick={actions.edit}
                  disabled={state.busy}
                />
              )}
              <ToolButton
                label={t("present")}
                icon="present"
                shortcut="F5"
                onClick={actions.present}
                disabled={state.busy}
              />
              <ToolButton
                label={t("openNew")}
                icon="open"
                onClick={actions.open}
                disabled={state.busy}
              />
              <ToolButton
                label={t("settings")}
                icon="settings"
                onClick={actions.settings}
                disabled={state.busy}
              />
            </div>
          </div>
          {(state.slideCount > 0 || state.presenting) && (
            <div className={`slide-navigation editor-toolbar${state.presenting ? " presentation-controls" : ""}${state.presenting && !state.presentationControls ? " idle" : ""}`} role="group" aria-label={t(state.presenting ? "present" : "slides")}>
              {state.slideCount > 0 && <>
                <ToolButton label={t("previousSlide")} icon="previous" onClick={actions.previousSlide} disabled={state.busy || state.slideIndex === 0} />
                <span className="slide-count" aria-live="polite">{state.slideIndex + 1} / {state.slideCount}</span>
                <ToolButton label={t("nextSlide")} icon="next" onClick={actions.nextSlide} disabled={state.busy || state.slideIndex === state.slideCount - 1} />
              </>}
              {state.presenting && <>
                <span className="presentation-hint">{t("presentationHint")}</span>
                <ToolButton label={t("exitPresentation")} icon="close" shortcut="Esc" onClick={actions.exitPresentation} disabled={state.busy} />
              </>}
            </div>
          )}
          {state.editing && !state.slideCount && (
            <div className="editing-hint">
              <span className="hint-intro">
                <Icon name="edit" />
                {t("hint")}
              </span>
              <span className="hint-key">
                <kbd>Enter</kbd>
                {t("done")}
              </span>
              <span className="hint-key">
                <kbd>Esc</kbd>
                {t("cancel")}
              </span>
            </div>
          )}
        </>
      )}
      <Settings state={state} />
      <Dialog.Root
        open={!!state.dialog}
        onOpenChange={(open) => {
          if (!open) dismissDialog();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog-popup">
            <div className="dialog-header">
              <span className="dialog-symbol">
                <Icon name="info" />
              </span>
              <ToolButton
                label={t("close")}
                icon="close"
                onClick={dismissDialog}
              />
            </div>
            <Dialog.Title className="dialog-title">
              {state.dialog?.title}
            </Dialog.Title>
            <Dialog.Description className="dialog-body">
              {state.dialog?.body}
            </Dialog.Description>
            <div className="dialog-actions">
              {state.dialog?.actions.map((action, index) => (
                <ToolButton
                  key={index}
                  label={action.label}
                  icon={action.icon ?? "check"}
                  variant={action.primary ? "primary" : "secondary"}
                  danger={action.danger}
                  onClick={action.action}
                />
              ))}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {state.notice && (
        <div className="notice" role="status">
          <Icon name="info" />
          <span>{state.notice}</span>
          <ToolButton
            label={t("dismiss")}
            icon="close"
            onClick={() => updateUI({ notice: null })}
          />
        </div>
      )}
    </Tooltip.Provider>
  );
}
export function mountShell(actions: ShellActions) {
  createRoot(document.getElementById("root")!).render(
    <Shell actions={actions} />,
  );
}
