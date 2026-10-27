import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BRUSHES, CANVAS_BG, PALETTE } from './palette.js';
import './DrawingCanvas.css';

/*
 * A 4:3 sketchbook canvas shared by Pictionary and Telephone.
 * Coordinates are normalised to 0..1 (3 decimals); brush sizes are px on a
 * 1000-px-wide reference canvas, scaled to the real width.
 *
 * Props:
 *   strokes        strokes to show / replay ([{ id, color, size, tool, points }])
 *   syncKey        when this changes the canvas resets to `strokes` (defaults to the strokes array itself)
 *   editable       show the toolbar and accept pointer input
 *   palette        [{ hex, name }]
 *   onStroke(seg)  live mode: called with segments of <= 200 points sharing a stroke id (~every 40ms)
 *   onUndo(), onClear()   called after a local undo / clear
 *   maxPoints, maxPointsPerStroke   local limits (a long stroke is split into a new id)
 *   label          accessible name for the canvas
 * Ref: { appendSegment(seg), clear(), undo(id), getStrokes() }
 */
const SEGMENT_MAX = 200;
const FLUSH_MS = 40;
const MIN_STEP = 0.002;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round3 = (n) => Math.round(n * 1000) / 1000;
const cloneStrokes = (list) => (list || []).map((s) => ({ ...s, points: s.points.map((p) => [p[0], p[1]]) }));
let idCounter = 0;
const newId = () => `s${Date.now().toString(36).slice(-6)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 24);

function paintStroke(ctx, stroke, width, from = 0) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.strokeStyle = ctx.fillStyle = stroke.tool === 'eraser' ? CANVAS_BG : stroke.color;
  ctx.lineWidth = Math.max(1, (stroke.size * width) / 1000);
  const h = (width * 3) / 4;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * width, pts[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const start = Math.max(0, from - 1);
  ctx.beginPath();
  ctx.moveTo(pts[start][0] * width, pts[start][1] * h);
  for (let i = start + 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0] * width, pts[i][1] * h);
  ctx.stroke();
}

export const DrawingCanvas = forwardRef(function DrawingCanvas(
  { strokes, syncKey, editable = false, palette = PALETTE, onStroke, onUndo, onClear, maxPoints = 30000, maxPointsPerStroke = 1000, label = 'Drawing', compact = false },
  ref,
) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const strokesRef = useRef(cloneStrokes(strokes));
  const widthRef = useRef(0);
  const activeRef = useRef(null); // { stroke, pending: [], pointerId }
  const flushTimer = useRef(null);
  const [color, setColor] = useState(palette[0].hex);
  const [size, setSize] = useState(BRUSHES[1].size);
  const [tool, setTool] = useState('pen');
  const [count, setCount] = useState(() => strokesRef.current.length);
  const [full, setFull] = useState(false);

  const totalPoints = () => strokesRef.current.reduce((n, s) => n + s.points.length, 0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const width = widthRef.current;
    if (!canvas || !width) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, (width * 3) / 4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokesRef.current) paintStroke(ctx, s, width);
    setCount(strokesRef.current.length);
  }, []);

  const paintFrom = useCallback((stroke, from) => {
    const canvas = canvasRef.current;
    if (!canvas || !widthRef.current) return;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paintStroke(ctx, stroke, widthRef.current, from);
  }, []);

  // Keep a 4:3 box that fills the width, on a devicePixelRatio-scaled backing store.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const resize = () => {
      const width = Math.floor(wrap.clientWidth);
      if (!width || width === widthRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      widthRef.current = width;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${(width * 3) / 4}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(((width * 3) / 4) * dpr);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  // Replay from props whenever the sync key changes (new turn, reconnect, fresh broadcast).
  const key = syncKey ?? strokes;
  useEffect(() => {
    strokesRef.current = cloneStrokes(strokes);
    setFull(false);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, redraw]);

  const flush = useCallback(() => {
    const active = activeRef.current;
    if (!active || !onStroke) return;
    while (active.pending.length) {
      const points = active.pending.splice(0, SEGMENT_MAX);
      const { id, color: c, size: z, tool: t } = active.stroke;
      onStroke({ id, color: c, size: z, tool: t, points });
    }
  }, [onStroke]);

  useEffect(() => () => clearInterval(flushTimer.current), []);

  const toPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [round3(clamp01((e.clientX - rect.left) / rect.width)), round3(clamp01((e.clientY - rect.top) / rect.height))];
  };

  const startStroke = (point, pointerId) => {
    const stroke = { id: newId(), color, size, tool, points: [point] };
    strokesRef.current.push(stroke);
    activeRef.current = { stroke, pending: [point], pointerId };
    setCount(strokesRef.current.length);
    paintFrom(stroke, 0);
  };

  const addPoint = (point) => {
    const active = activeRef.current;
    const { stroke } = active;
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_STEP) return;
    if (totalPoints() >= maxPoints) {
      setFull(true);
      return;
    }
    if (stroke.points.length >= maxPointsPerStroke) {
      // Continue seamlessly as a new stroke so no single stroke is too long.
      flush();
      startStroke(last, active.pointerId);
      activeRef.current.pending = [last];
    }
    activeRef.current.stroke.points.push(point);
    activeRef.current.pending.push(point);
    paintFrom(activeRef.current.stroke, activeRef.current.stroke.points.length - 1);
  };

  const onPointerDown = (e) => {
    if (!editable || activeRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (totalPoints() >= maxPoints) {
      setFull(true);
      return;
    }
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    startStroke(toPoint(e), e.pointerId);
    if (onStroke) flushTimer.current = setInterval(flush, FLUSH_MS);
  };

  const onPointerMove = (e) => {
    const active = activeRef.current;
    if (!active || e.pointerId !== active.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() || [e];
    for (const ev of events.length ? events : [e]) addPoint(toPoint(ev));
  };

  const endStroke = (e) => {
    const active = activeRef.current;
    if (!active || (e && e.pointerId !== active.pointerId)) return;
    clearInterval(flushTimer.current);
    flush();
    activeRef.current = null;
  };

  const doUndo = () => {
    endStroke();
    if (!strokesRef.current.length) return;
    strokesRef.current.pop();
    setFull(false);
    redraw();
    onUndo?.();
  };
  const doClear = () => {
    endStroke();
    strokesRef.current = [];
    setFull(false);
    redraw();
    onClear?.();
  };

  useImperativeHandle(ref, () => ({
    appendSegment(seg) {
      if (!seg?.id || !Array.isArray(seg.points)) return;
      const existing = strokesRef.current.find((s) => s.id === seg.id);
      if (existing) {
        const from = existing.points.length;
        existing.points.push(...seg.points);
        paintFrom(existing, from);
      } else {
        const stroke = { ...seg, points: seg.points.map((p) => [p[0], p[1]]) };
        strokesRef.current.push(stroke);
        paintFrom(stroke, 0);
        setCount(strokesRef.current.length);
      }
    },
    clear() {
      strokesRef.current = [];
      redraw();
    },
    undo(id) {
      const i = strokesRef.current.findLastIndex ? strokesRef.current.findLastIndex((s) => s.id === id) : strokesRef.current.map((s) => s.id).lastIndexOf(id);
      if (i >= 0) strokesRef.current.splice(i, 1);
      redraw();
    },
    getStrokes() {
      endStroke();
      return cloneStrokes(strokesRef.current);
    },
  }), [paintFrom, redraw]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`dc ${compact ? 'dc-compact' : ''}`}>
      <div ref={wrapRef} className={`dc-sheet ${editable ? 'dc-live' : ''}`}>
        <canvas
          ref={canvasRef}
          className="dc-canvas"
          role="img"
          aria-label={editable ? `${label}. Draw with your finger, pen or mouse.` : label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
        />
      </div>
      {editable && (
        <div className="dc-tools" role="toolbar" aria-label="Drawing tools">
          <div className="dc-group" role="group" aria-label="Colours">
            {palette.map((p) => (
              <button
                key={p.hex}
                type="button"
                className="dc-swatch"
                style={{ '--swatch': p.hex }}
                aria-label={p.name}
                aria-pressed={tool === 'pen' && color === p.hex}
                onClick={() => {
                  setColor(p.hex);
                  setTool('pen');
                }}
              />
            ))}
          </div>
          <div className="dc-group" role="group" aria-label="Brush size">
            {BRUSHES.map((b) => (
              <button key={b.size} type="button" className="dc-tool" aria-label={`${b.name} brush`} aria-pressed={size === b.size} onClick={() => setSize(b.size)}>
                <span className="dc-dot" style={{ '--dot': `${Math.max(4, b.size * 0.8)}px` }} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="dc-tool dc-text" aria-pressed={tool === 'eraser'} onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')}>
              <span aria-hidden="true">🧽</span> Eraser
            </button>
            <button type="button" className="dc-tool dc-text" onClick={doUndo} disabled={!count}>
              <span aria-hidden="true">↶</span> Undo
            </button>
            <button type="button" className="dc-tool dc-text" onClick={doClear} disabled={!count}>
              <span aria-hidden="true">🗑</span> Clear
            </button>
          </div>
          {full && <p className="dc-full" role="status">The page is full! Undo or clear to keep drawing.</p>}
        </div>
      )}
    </div>
  );
});

export default DrawingCanvas;
