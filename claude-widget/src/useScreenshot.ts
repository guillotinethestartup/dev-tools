import { useState, useCallback } from 'react';

export interface CaptureOptions {
  includeWidget: boolean;
}

export interface CaptureResult {
  data: string;
  width: number;
  height: number;
}

export interface ScreenshotResult {
  capture: (opts?: Partial<CaptureOptions>) => Promise<CaptureResult | null>;
  isCapturing: boolean;
  error: string | null;
}

const DEFAULTS: CaptureOptions = { includeWidget: false };

export function useScreenshot(): ScreenshotResult {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (opts?: Partial<CaptureOptions>): Promise<CaptureResult | null> => {
    const { includeWidget } = { ...DEFAULTS, ...opts };
    setIsCapturing(true);
    setError(null);
    try {
      const { default: html2canvas } = await import('html2canvas-pro');

      const appRoot = document.getElementById('__next') ?? document.getElementById('root') ?? document.body;

      const canvas = await html2canvas(appRoot, {
        scale: 0.75,
        useCORS: true,
        logging: false,
        backgroundColor: '#000000',
        ignoreElements: (el: Element) => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.dataset.screenshotPopover === 'true') return true;
          if (!includeWidget && el.dataset.devWidget === 'true') return true;
          return false;
        },
      });

      const data = canvas.toDataURL('image/png').split(',')[1];
      return { data, width: canvas.width, height: canvas.height };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Screenshot capture failed:', err);
      setError(msg);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return { capture, isCapturing, error };
}
