import { useEffect, useRef, useState } from 'react';

interface DesmosCalculator {
  setExpression(expr: { id: string; latex: string }): void;
  destroy(): void;
}
export interface DesmosApi {
  GraphingCalculator(el: HTMLElement, options?: Record<string, unknown>): DesmosCalculator;
}
declare global {
  interface Window {
    Desmos?: DesmosApi;
  }
}

export const DESMOS_TIMEOUT_MS = 8000;
export const DESMOS_URL = 'https://www.desmos.com/calculator';
const scriptUrl = (key: string) =>
  `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${encodeURIComponent(key)}`;

let loading: Promise<DesmosApi> | null = null;

/** Loads the Desmos API script once. Rejects on error or after the timeout. */
export function loadDesmos(key: string, timeoutMs = DESMOS_TIMEOUT_MS): Promise<DesmosApi> {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (loading) return loading;
  loading = new Promise<DesmosApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl(key);
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error('Desmos load timed out')), timeoutMs);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Desmos) resolve(window.Desmos);
      else reject(new Error('Desmos script loaded without the Desmos global'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Desmos script failed to load'));
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

interface Props {
  apiKey: string | null;
  /** LaTeX expressions to preload. */
  expressions?: readonly string[];
  /** Injected in tests. */
  loader?: (key: string) => Promise<DesmosApi>;
}

export default function DesmosPanel({ apiKey, expressions = [], loader = loadDesmos }: Props) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const exprKey = expressions.join('\n');

  useEffect(() => {
    if (apiKey === null) return;
    let calc: DesmosCalculator | null = null;
    let cancelled = false;
    loader(apiKey).then(
      (api) => {
        if (cancelled || host.current === null) return;
        calc = api.GraphingCalculator(host.current, {
          expressions: true,
          keypad: true,
          settingsMenu: false,
        });
        exprKey
          .split('\n')
          .filter((latex) => latex !== '')
          .forEach((latex, i) => calc?.setExpression({ id: `e${i}`, latex }));
        setReady(true);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      calc?.destroy();
    };
  }, [apiKey, loader, exprKey]);

  if (apiKey === null || failed) {
    return (
      <div className="desmos-fallback">
        <p>
          Use the Desmos graphing calculator in a new tab.
          {expressions.length > 0 && ' Try entering:'}
        </p>
        {expressions.length > 0 && (
          <ul className="desmos-expressions">
            {expressions.map((e) => (
              <li key={e}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        )}
        <a className="button" href={DESMOS_URL} target="_blank" rel="noopener noreferrer">
          Open Desmos
        </a>
      </div>
    );
  }
  return (
    <div className="desmos-panel">
      <div ref={host} className="desmos-host" aria-label="Desmos graphing calculator" />
      {!ready && <p className="hint">Loading calculator…</p>}
    </div>
  );
}
