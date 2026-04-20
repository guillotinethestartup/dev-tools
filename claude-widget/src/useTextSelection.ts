import { useCallback, useEffect, useRef, useState } from 'react';

export type SelectionSource = 'console' | 'server' | 'raw' | 'diff' | 'page';

export interface SelectionChip {
  id: string;
  source: SelectionSource;
  text: string;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface SelectionUI {
  popover: { x: number; y: number };
  start: { x: number; y: number };
  end: { x: number; y: number };
  source: SelectionSource;
  file?: string;
}

export interface TextSelectionApi {
  chips: SelectionChip[];
  removeChip: (id: string) => void;
  clearChips: () => void;
  selectionUI: SelectionUI | null;
  attachCurrentSelection: () => void;
  dismissSelectionUI: () => void;
  onHandleMouseDown: (which: 'start' | 'end') => (e: React.MouseEvent) => void;
  formatChip: (c: SelectionChip) => string;
}

function findAncestorWithAttr(node: Node | null, attr: string): Element | null {
  let el: Element | null =
    node?.nodeType === 3 ? node.parentElement : (node as Element | null);
  while (el && !el.hasAttribute(attr)) el = el.parentElement;
  return el;
}

function lineAttrForSource(source: string | null): string {
  return source === 'diff' ? 'data-line-new' : 'data-selection-line';
}

export function useTextSelection(): TextSelectionApi {
  const [chips, setChips] = useState<SelectionChip[]>([]);
  const [selectionUI, setSelectionUI] = useState<SelectionUI | null>(null);

  const computeSelectionUI = useCallback((): SelectionUI | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const container = findAncestorWithAttr(range.startContainer, 'data-selection-source');
    if (!container) return null;
    const source = container.getAttribute('data-selection-source') as SelectionSource;
    const file = container.getAttribute('data-selection-file') ?? undefined;
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
    if (rects.length === 0) return null;
    const first = rects[0];
    const last = rects[rects.length - 1];
    return {
      popover: { x: first.left, y: first.top },
      start: { x: first.left, y: first.top },
      end: { x: last.right, y: last.bottom },
      source,
      file,
    };
  }, []);

  const snapSelectionToLines = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = findAncestorWithAttr(range.startContainer, 'data-selection-source');
    if (!container) return;
    const lineAttr = lineAttrForSource(container.getAttribute('data-selection-source'));
    const lines = container.querySelectorAll(`[${lineAttr}]`);
    let first: Element | null = null;
    let last: Element | null = null;
    for (const el of lines) {
      const lineRange = document.createRange();
      lineRange.selectNode(el);
      const endAfterStart = range.compareBoundaryPoints(Range.START_TO_END, lineRange) > 0;
      const startBeforeEnd = range.compareBoundaryPoints(Range.END_TO_START, lineRange) < 0;
      if (endAfterStart && startBeforeEnd) {
        if (!first) first = el;
        last = el;
      }
    }
    if (!first || !last) return;
    const newRange = document.createRange();
    newRange.setStartBefore(first);
    newRange.setEndAfter(last);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }, []);

  useEffect(() => {
    const isPointerDown = { current: false };
    const isDraggingHandle = { current: false };

    const onSelectionChange = () => {
      if (isDraggingHandle.current) return;
      if (isPointerDown.current) {
        setSelectionUI(null);
        return;
      }
      setSelectionUI(computeSelectionUI());
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('[data-selection-handle]')) {
        isDraggingHandle.current = true;
        return;
      }
      if (target && findAncestorWithAttr(target, 'data-selection-source')) {
        isPointerDown.current = true;
        setSelectionUI(null);
      }
    };

    const onPointerUp = () => {
      if (isDraggingHandle.current) {
        isDraggingHandle.current = false;
        snapSelectionToLines();
        setSelectionUI(computeSelectionUI());
        return;
      }
      if (!isPointerDown.current) return;
      isPointerDown.current = false;
      snapSelectionToLines();
      setSelectionUI(computeSelectionUI());
    };

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [computeSelectionUI, snapSelectionToLines]);

  const handleDragState = useRef<{
    which: 'start' | 'end';
    otherNode: Node;
    otherOffset: number;
  } | null>(null);

  const onHandleMouseDown = useCallback(
    (which: 'start' | 'end') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      handleDragState.current = {
        which,
        otherNode: which === 'start' ? range.endContainer : range.startContainer,
        otherOffset: which === 'start' ? range.endOffset : range.startOffset,
      };

      const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        const state = handleDragState.current;
        if (!state) return;
        const handles = document.querySelectorAll<HTMLElement>('[data-selection-handle]');
        handles.forEach((h) => (h.style.visibility = 'hidden'));
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        handles.forEach((h) => (h.style.visibility = ''));
        if (!hit) return;
        const container = findAncestorWithAttr(hit, 'data-selection-source');
        if (!container) return;
        const lineAttr = lineAttrForSource(container.getAttribute('data-selection-source'));
        const line = findAncestorWithAttr(hit, lineAttr);
        if (!line) return;
        const curSel = window.getSelection();
        if (!curSel) return;
        const newRange = document.createRange();
        try {
          if (state.which === 'start') {
            newRange.setStartBefore(line);
            newRange.setEnd(state.otherNode, state.otherOffset);
          } else {
            newRange.setStart(state.otherNode, state.otherOffset);
            newRange.setEndAfter(line);
          }
          if (newRange.compareBoundaryPoints(Range.START_TO_END, newRange) <= 0) return;
        } catch {
          return;
        }
        curSel.removeAllRanges();
        curSel.addRange(newRange);
        setSelectionUI(computeSelectionUI());
      };

      const onUp = () => {
        handleDragState.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        snapSelectionToLines();
        setSelectionUI(computeSelectionUI());
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [computeSelectionUI, snapSelectionToLines],
  );

  const attachCurrentSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    const container = findAncestorWithAttr(range.startContainer, 'data-selection-source');
    if (!container) return;
    const source = container.getAttribute('data-selection-source') as SelectionSource;
    const file = container.getAttribute('data-selection-file') ?? undefined;
    const lineAttr = lineAttrForSource(source);

    const startLine = findAncestorWithAttr(range.startContainer, lineAttr);
    const endLine = findAncestorWithAttr(range.endContainer, lineAttr);
    if (startLine) range.setStartBefore(startLine);
    if (endLine) range.setEndAfter(endLine);

    const text = range.toString().replace(/\n+$/, '');
    if (!text.trim()) return;

    let lineStart: number | undefined;
    let lineEnd: number | undefined;
    if (source === 'diff') {
      const parseLine = (el: Element | null): number | undefined => {
        const v = el?.getAttribute('data-line-new');
        if (!v || v === 'undefined') return undefined;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : undefined;
      };
      lineStart = parseLine(startLine);
      lineEnd = parseLine(endLine);
      if (lineStart !== undefined && lineEnd !== undefined && lineEnd < lineStart) {
        [lineStart, lineEnd] = [lineEnd, lineStart];
      }
    }

    setChips((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).slice(2),
        source,
        text,
        file,
        lineStart,
        lineEnd,
      },
    ]);
    sel.removeAllRanges();
    setSelectionUI(null);
  }, []);

  const removeChip = useCallback((id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearChips = useCallback(() => setChips([]), []);

  const dismissSelectionUI = useCallback(() => setSelectionUI(null), []);

  const formatChip = useCallback((c: SelectionChip): string => {
    const sourceLabel: Record<SelectionSource, string> = {
      console: 'browser console',
      server: 'server logs',
      raw: 'raw events',
      diff: 'diff',
      page: 'page',
    };
    let header = `## Selection from ${sourceLabel[c.source]}`;
    if (c.source === 'diff' && c.file) {
      const range =
        c.lineStart !== undefined
          ? c.lineEnd && c.lineEnd !== c.lineStart
            ? ` lines ${c.lineStart}-${c.lineEnd}`
            : ` line ${c.lineStart}`
          : '';
      header = `## Selection from diff \`${c.file}\`${range}`;
    }
    return `${header}\n\`\`\`\n${c.text}\n\`\`\``;
  }, []);

  return {
    chips,
    removeChip,
    clearChips,
    selectionUI,
    attachCurrentSelection,
    dismissSelectionUI,
    onHandleMouseDown,
    formatChip,
  };
}
