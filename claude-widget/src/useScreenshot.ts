import { useState, useCallback } from 'react';

export interface ScreenshotResult {
  capture: () => Promise<string | null>;
  isCapturing: boolean;
}

export function useScreenshot(): ScreenshotResult {
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = useCallback(async (): Promise<string | null> => {
    setIsCapturing(true);
    try {
      const { default: html2canvas } = await import('html2canvas');

      // Capture #root (the app), not the whole body — excludes the chat widget
      const appRoot = document.getElementById('root');
      if (!appRoot) return null;

      const canvas = await html2canvas(appRoot, {
        scale: 0.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#000000',
      });

      // Return base64 PNG without the data:image/png;base64, prefix
      return canvas.toDataURL('image/png').split(',')[1];
    } catch (err) {
      console.error('Screenshot capture failed:', err);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return { capture, isCapturing };
}
