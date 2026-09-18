import { useSyncExternalStore, type ReactNode, type PointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { getLocale, setLocale, subscribeLocale, t } from "./i18n.ts";
import { Separator } from "@base-ui/react/separator";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  dismissDialog,
  getUI,
  subscribeUI,
  updateUI,
  type ShellActions,
} from "./ui-state.ts";

type IconName =
  | "file"
  | "project"
  | "previous"
  | "next"
  | "open"
  | "edit"
  | "arrow"
  | "undo"
  | "redo"
  | "eye"
  | "export"
  | "more"
  | "close"
  | "info"
  | "shield"
  | "settings"
  | "check"
  | "trash"
  | "sample";
const paths: Record<IconName, ReactNode> = {
  project: <path d="M3 7V4h7l2 3h9v13H3ZM7 11h10M7 15h6" />,
  previous: <path d="m15 5-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
  settings: (
    <>
      <path d="m10 3-.5 3-2 1-3-.5-2 3 2 2v2l-2 2 2 3 3-.5 2 1 .5 3h4l.5-3 2-1 3 .5 2-3-2-2v-2l2-2-2-3-3 .5-2-1L14 3Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
  sample: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m10 8 6 4-6 4Z" />
    </>
  ),
  file: (
    <>
      <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" />
      <path d="M13 3v7h7M8 14h8M8 17h5" />
    </>
  ),
  open: (
    <path d="M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 10h18l-3 10H5Z" />
  ),
  edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  undo: <path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12" />,
  redo: <path d="m16 4 5 5-5 5m5-5H11a6 6 0 0 0 0 12" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  export: <path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
};
function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
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
  return /Mac/.test(navigator.platform) ? (
    <span
      className="window-grip"
      data-tauri-drag-region
      aria-hidden="true"
      title={t("dragWindow")}
    />
  ) : null;
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
          <div className="floating">
            <div
              className="editor-toolbar"
              role="group"
              aria-label={t("toolbar")}
            >
              <WindowGrip />
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
          <div className="floating">
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
              <WindowGrip />
              {state.editing ? (
                <>
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
          {state.slideCount > 0 && (
            <div className="slide-navigation editor-toolbar" role="group" aria-label={t("slides")}>
              <ToolButton label={t("previousSlide")} icon="previous" onClick={actions.previousSlide} disabled={state.busy || state.slideIndex === 0} />
              <span className="slide-count" aria-live="polite">{state.slideIndex + 1} / {state.slideCount}</span>
              <ToolButton label={t("nextSlide")} icon="next" onClick={actions.nextSlide} disabled={state.busy || state.slideIndex === state.slideCount - 1} />
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
