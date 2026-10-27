import './SettingsForm.css';

// Renders a game's settings from the server's definitions, so each game
// only shows the options that matter to it.
export function SettingsForm({ definitions, values, onChange, disabled = false, idPrefix = 'setting' }) {
  if (!definitions?.length) return <p className="muted">This game has no settings. Just play!</p>;
  return (
    <div className="settings">
      {definitions.map((def) => {
        const id = `${idPrefix}-${def.key}`;
        const value = values?.[def.key] ?? def.default;
        if (def.type === 'boolean') {
          return (
            <label key={def.key} className="toggle settings-toggle" htmlFor={id}>
              <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(def.key, e.target.checked)} />
              <span>{def.label}</span>
            </label>
          );
        }
        if (def.type === 'number') {
          return (
            <div key={def.key} className="field">
              <label className="field-label" htmlFor={id}>
                {def.label} <output className="settings-value numeric" htmlFor={id}>{value}</output>
              </label>
              <input
                id={id}
                className="settings-range"
                type="range"
                min={def.min}
                max={def.max}
                step={def.step || 1}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(def.key, Number(e.target.value))}
              />
            </div>
          );
        }
        return (
          <div key={def.key} className="field">
            <label className="field-label" htmlFor={id}>{def.label}</label>
            <select id={id} className="select" value={value} disabled={disabled} onChange={(e) => onChange(def.key, e.target.value)}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
