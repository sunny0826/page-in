import { Fragment, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Separator } from '@base-ui/react/separator';
import { Tooltip } from '@base-ui/react/tooltip';
import { getLocale, subscribeLocale, t } from './i18n.ts';
import { dismissDialog, getUI, subscribeUI, updateUI, type ShellActions, type ShellState } from './ui-state.ts';
import { Icon, Modal, ToolButton, type ToolProps } from './shell/controls.tsx';
import { Settings } from './shell/settings.tsx';
import { Welcome } from './shell/welcome.tsx';

function DocumentStatus({ state }: { state: ShellState }) {
  const status = t(state.busy ? 'busy' : state.dirty ? 'dirty' : 'clean');
  const format = state.documentFormat;
  return <>
    {format && <span className="document-format" title={t(`${format}FormatHint`)}
      aria-label={`${t('documentFormat')}: ${t(`${format}FormatHint`)}`}>{t(`${format}Format`)}</span>}
    <div className="document-status" title={`${state.filename} · ${status}`}>
      <span className={`status-dot ${state.dirty ? 'dirty' : ''} ${state.busy ? 'pending' : ''}`} />
      <div><span className="filename" title={state.filename!}>{state.filename}</span>
        <span className="save-status" role="status">{status}</span></div>
    </div>
    <Separator orientation="vertical" className="toolbar-separator" />
  </>;
}
function Toolbar({ state, actions }: { state: ShellState; actions: ShellActions }) {
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const buttons: ToolProps[] = [];
  if (state.filename) {
    if (state.editing) buttons.push(
      { label: t('undo'), icon: 'undo', shortcut: `${mod}Z`, onClick: actions.undo, disabled: !state.canUndo && !state.activeInput },
      { label: t('redo'), icon: 'redo', shortcut: `⇧${mod}Z`, onClick: actions.redo, disabled: !state.canRedo },
      { label: t('preview'), icon: 'eye', onClick: actions.preview },
      { label: t(state.project ? 'exportProject' : 'export'), icon: 'export', variant: 'primary', onClick: actions.exportFile },
    );
    else buttons.push({ label: t('edit'), icon: 'edit', onClick: actions.edit });
    buttons.push({ label: t('present'), icon: 'present', shortcut: 'F5', onClick: actions.present });
  }
  buttons.push(
    { label: t('openNew'), icon: 'open', onClick: actions.open },
    { label: t('settings'), icon: 'settings', onClick: actions.settings },
  );
  return <div className="titlebar" hidden={state.presenting}>
    <span className="titlebar-drag-region" data-tauri-drag-region aria-hidden="true" title={t('dragWindow')} />
    <div className="editor-toolbar" role="group" aria-label={t('toolbar')} aria-busy={state.busy}>
      {state.filename && <DocumentStatus state={state} />}
      {buttons.map(button => <Fragment key={button.icon}>
        {button.icon === 'present' && state.editing && <Separator orientation="vertical" className="toolbar-separator" />}
        <ToolButton {...button} disabled={state.busy || button.disabled} />
      </Fragment>)}
    </div>
  </div>;
}
function Navigation({ state, actions }: { state: ShellState; actions: ShellActions }) {
  if (!state.slideCount && !state.presenting) return null;
  return <div className={`slide-navigation editor-toolbar${state.presenting ? ' presentation-controls' : ''}${state.presenting && !state.presentationControls ? ' idle' : ''}`}
    role="group" aria-label={t(state.presenting ? 'present' : 'slides')}>
    {state.slideCount > 0 && <>
      <ToolButton label={t('previousSlide')} icon="previous" onClick={actions.previousSlide} disabled={state.busy || state.slideIndex === 0} />
      <span className="slide-count" aria-live="polite">{state.slideIndex + 1} / {state.slideCount}</span>
      <ToolButton label={t('nextSlide')} icon="next" onClick={actions.nextSlide} disabled={state.busy || state.slideIndex === state.slideCount - 1} />
    </>}
    {state.presenting && <>
      <span className="presentation-hint">{t('presentationHint')}</span>
      <ToolButton label={t('exitPresentation')} icon="close" shortcut="Esc" onClick={actions.exitPresentation} disabled={state.busy} />
    </>}
  </div>;
}
function Shell({ actions }: { actions: ShellActions }) {
  const state = useSyncExternalStore(subscribeUI, getUI);
  useSyncExternalStore(subscribeLocale, getLocale);
  return <Tooltip.Provider delay={450}>
    {!state.filename && <Welcome actions={actions} busy={state.busy} />}
    <Toolbar state={state} actions={actions} />
    {state.filename && <Navigation state={state} actions={actions} />}
    {state.filename && state.editing && !state.slideCount && <div className="editing-hint">
      <span className="hint-intro"><Icon name="edit" />{t('hint')}</span>
      {([['Enter', 'done'], ['Esc', 'cancel']] as const).map(([key, label]) =>
        <span className="hint-key" key={key}><kbd>{key}</kbd>{t(label)}</span>)}
    </div>}
    <Settings state={state} />
    <Modal open={!!state.dialog} close={dismissDialog} title={state.dialog?.title} body={state.dialog?.body}>
      <div className="dialog-actions">{state.dialog?.actions.map((action, index) =>
        <ToolButton key={index} label={action.label} icon={action.icon ?? 'check'}
          variant={action.primary ? 'primary' : 'secondary'} danger={action.danger} onClick={action.action} />)}
      </div>
    </Modal>
    {state.notice && <div className="notice" role="status">
      <Icon name="info" /><span>{state.notice}</span>
      <ToolButton label={t('dismiss')} icon="close" onClick={() => updateUI({ notice: null })} />
    </div>}
  </Tooltip.Provider>;
}
export function mountShell(actions: ShellActions) {
  createRoot(document.getElementById('root')!).render(<Shell actions={actions} />);
}
