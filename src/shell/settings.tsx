import { getLocale, setLocale, t, type MessageKey } from '../i18n.ts';
import { updateUI, type ShellState } from '../ui-state.ts';
import { Icon, Modal } from './controls.tsx';

export function Settings({ state }: { state: ShellState }) {
  const data = state.diagnostics;
  const diagnostics: [MessageKey, string][] = [
    ['version', `PageIn ${__APP_VERSION__}`], ['file', data?.filename ?? t('noFile')],
    ['fragments', `${data?.editable ?? 0} / ${data?.total ?? 0}`],
    ['parse', `${data?.parseMs.toFixed(1) ?? '0.0'} ms`],
    ['startup', `${data?.startupMs.toFixed(1) ?? '0.0'} ms`],
    ['sandbox', t('sandboxBody')], ['engine', data?.engine ?? ''],
  ];
  return <Modal open={state.settingsOpen} close={() => updateUI({ settingsOpen: false })}
    title={t('settings')} body={t('settingsBody')} icon="settings" className="settings-page">
    <section className="settings-section">
      <fieldset className="language-field">
        <legend>{t('language')}</legend><p>{t('languageBody')}</p>
        <div className="language-options">
          {([['zh', '中文'], ['en', 'English']] as const).map(([locale, label]) =>
            <label className="language-option" key={locale}>
              <input type="radio" name="language" value={locale} checked={getLocale() === locale}
                onChange={() => setLocale(locale)} />
              <span lang={locale === 'zh' ? 'zh-CN' : 'en'}>{label}</span>
            </label>)}
        </div>
      </fieldset>
    </section>
    <section className="settings-section" aria-labelledby="diagnostics-title">
      <h2 id="diagnostics-title"><Icon name="info" />{t('diagnostics')}</h2>
      <dl className="diagnostics-list">
        {diagnostics.map(([key, value]) => <div key={key} className={`diagnostic-${key}`}>
          <dt>{t(key)}</dt><dd>{value}</dd>
        </div>)}
      </dl>
    </section>
  </Modal>;
}
