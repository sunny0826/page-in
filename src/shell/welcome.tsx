import { t } from '../i18n.ts';
import type { ShellActions } from '../ui-state.ts';
import { Icon, ToolButton } from './controls.tsx';

export function Welcome({ actions, busy }: { actions: ShellActions; busy: boolean }) {
  return <main className="welcome" aria-busy={busy}>
    <section className="welcome-main">
      <div className="intro">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1>{t('headline')}<br /><span className="accent">{t('headlineEnd')}</span></h1>
        <p>{t('intro')}</p>
        <div className="welcome-actions">
          <ToolButton label={t(busy ? 'opening' : 'open')} icon="open" variant="primary" onClick={actions.open} disabled={busy} />
          <ToolButton label={t('sample')} icon="sample" variant="secondary" onClick={actions.sample} disabled={busy} />
        </div>
        <span className="file-note">{t('fileNote')}</span>
      </div>
      <div className="page-demo" aria-hidden="true">
        <div className="demo-browser">
          <div className="window-dots"><i /><i /><i /></div>
          <span>your-page.html</span><Icon name="shield" />
        </div>
        <div className="demo-page">
          <div className="demo-label">A LITTLE CHANGE</div>
          <div className="demo-title">{t('demoTitle')}<br /><span>{t('demoEnd')}<span className="demo-caret" /></span></div>
          <div className="demo-line" /><div className="demo-line short" />
          <div className="demo-bottom"><span className="demo-pill">{t('demoStyle')}</span><span>01 — 03</span></div>
        </div>
        <div className="demo-tag"><Icon name="edit" /></div>
      </div>
    </section>
    <section className="steps" aria-label={t('steps')}>
      {(['Open', 'Edit', 'Export'] as const).map((step, index) => <div className="step" key={step}>
        <span className="step-number">0{index + 1}</span>
        <div><h2>{t(`step${step}`)}</h2><p>{t(`step${step}Body`)}</p></div>
      </div>)}
    </section>
    <footer className="welcome-footer">
      <span><Icon name="shield" />{t('privacy')}</span><span>{t('footer')}</span>
    </footer>
  </main>;
}
