import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  css: string;
}

export function ShadowRoot({ children, css }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountPoint, setMountPoint] = useState<HTMLDivElement | null>(null);
  const sheetRef = useRef<CSSStyleSheet | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.shadowRoot) return;

    const shadow = host.attachShadow({ mode: 'open' });

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
    sheetRef.current = sheet;

    const container = document.createElement('div');
    shadow.appendChild(container);
    setMountPoint(container);
  }, []);

  useEffect(() => {
    if (sheetRef.current) {
      sheetRef.current.replaceSync(css);
    }
  }, [css]);

  return (
    <>
      <div ref={hostRef} style={{ display: 'contents' }} />
      {mountPoint && createPortal(children, mountPoint)}
    </>
  );
}
