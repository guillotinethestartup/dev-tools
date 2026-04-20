import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './DevChatPane.module.css';
import { useScreenshot, type CaptureOptions, type CaptureResult } from './useScreenshot';

interface Props {
  active: boolean;
  onAttach: (data: string) => void;
}

export function ScreenshotPanel({ active, onAttach }: Props) {
  const { capture, isCapturing, error } = useScreenshot();
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  const [opts, setOpts] = useState<CaptureOptions>({ includeWidget: false });
  const [region, setRegion] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setPreview(null);
    setRegion(null);
    (async () => {
      const result = await capture(opts);
      if (!cancelled) setPreview(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, opts, capture]);

  const onDragStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const img = imgRef.current;
      if (!img || !preview) return;
      e.preventDefault();
      const rect = img.getBoundingClientRect();
      const scaleX = preview.width / rect.width;
      const scaleY = preview.height / rect.height;
      const startX = (e.clientX - rect.left) * scaleX;
      const startY = (e.clientY - rect.top) * scaleY;
      setRegion({ x: startX, y: startY, w: 0, h: 0 });

      const onMove = (ev: MouseEvent) => {
        const cx = Math.max(rect.left, Math.min(rect.right, ev.clientX));
        const cy = Math.max(rect.top, Math.min(rect.bottom, ev.clientY));
        const curX = (cx - rect.left) * scaleX;
        const curY = (cy - rect.top) * scaleY;
        setRegion({
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          w: Math.abs(curX - startX),
          h: Math.abs(curY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [preview],
  );

  const attach = useCallback(async () => {
    if (!preview) return;
    let finalData = preview.data;
    if (region && region.w > 4 && region.h > 4) {
      const img = new Image();
      img.src = `data:image/png;base64,${preview.data}`;
      await new Promise<void>((res) => {
        img.onload = () => res();
      });
      const canvas = document.createElement('canvas');
      canvas.width = region.w;
      canvas.height = region.h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
        finalData = canvas.toDataURL('image/png').split(',')[1];
      }
    }
    onAttach(finalData);
    setPreview(null);
    setRegion(null);
  }, [preview, region, onAttach]);

  return (
    <div className={styles.screenshotPanel}>
      <div className={styles.screenshotPreview} onMouseDown={onDragStart}>
        {isCapturing ? (
          <div className={styles.screenshotLoading}>Capturing…</div>
        ) : error ? (
          <div className={styles.screenshotLoading}>Capture failed: {error}</div>
        ) : preview ? (
          <>
            <img
              ref={imgRef}
              src={`data:image/png;base64,${preview.data}`}
              alt="Screenshot preview"
              draggable={false}
            />
            {region && region.w > 0 && region.h > 0 && (() => {
              const img = imgRef.current;
              if (!img) return null;
              const rect = img.getBoundingClientRect();
              const scaleX = rect.width / preview.width;
              const scaleY = rect.height / preview.height;
              return (
                <div
                  className={styles.screenshotSelection}
                  style={{
                    left: img.offsetLeft + region.x * scaleX,
                    top: img.offsetTop + region.y * scaleY,
                    width: region.w * scaleX,
                    height: region.h * scaleY,
                  }}
                />
              );
            })()}
          </>
        ) : (
          <div className={styles.screenshotLoading}>No capture</div>
        )}
      </div>
      <label className={styles.screenshotCheckbox}>
        <input
          type="checkbox"
          checked={opts.includeWidget}
          onChange={(e) => setOpts((o) => ({ ...o, includeWidget: e.target.checked }))}
        />
        Include widget
      </label>
      <div className={styles.screenshotHint}>
        {region && region.w > 4 && region.h > 4
          ? `Region: ${Math.round(region.w)}×${Math.round(region.h)} — drag again to reselect`
          : 'Drag on the preview to select a region (optional)'}
      </div>
      <div className={styles.screenshotActions}>
        {region && (
          <button className={styles.screenshotCancel} onClick={() => setRegion(null)}>
            Clear region
          </button>
        )}
        <button
          className={styles.screenshotAttach}
          onClick={attach}
          disabled={!preview || isCapturing}
        >
          Attach
        </button>
      </div>
    </div>
  );
}
