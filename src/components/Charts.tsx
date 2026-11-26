import React, { useState } from 'react';
import { formatCompact, formatCount, formatDate } from '../lib/api';
import type { VideoSnapshot } from '../types';

interface SnapshotChartProps {
  snapshots: VideoSnapshot[];
  metric: 'view_count' | 'like_count' | 'subscriber_count';
  label: string;
}

export const SnapshotLineChart: React.FC<SnapshotChartProps> = ({ snapshots, metric, label }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const validPoints = snapshots
    .map((s) => ({
      snapshot: s,
      value: s[metric],
    }))
    .filter((p): p is { snapshot: VideoSnapshot; value: number } => typeof p.value === 'number' && Number.isFinite(p.value));

  if (validPoints.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-700">No numeric {label.toLowerCase()} snapshots available yet</p>
        <p className="text-xs text-slate-500 mt-1">
          Refresh live statistics or verify a YouTube Data API v3 key is configured to chart historical trends.
        </p>
      </div>
    );
  }

  const width = 560;
  const height = 210;
  const padLeft = 52;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 34;

  const values = validPoints.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const minVal = rawMin === rawMax ? Math.max(0, rawMin - 10) : rawMin;
  const maxVal = rawMin === rawMax ? rawMax + 10 : rawMax;
  const range = maxVal - minVal || 1;

  const coords = validPoints.map((p, idx) => {
    const x =
      validPoints.length === 1
        ? padLeft + (width - padLeft - padRight) / 2
        : padLeft + (idx / (validPoints.length - 1)) * (width - padLeft - padRight);
    const y = padTop + (1 - (p.value - minVal) / range) * (height - padTop - padBottom);
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padBottom).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padBottom).toFixed(1)} Z`
      : '';

  const yTicks = [minVal, minVal + range * 0.5, maxVal];
  const inspected = activeIndex !== null ? coords[activeIndex] : coords[coords.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700">{label} History</span>
        {inspected && (
          <span className="font-mono tabular-nums text-slate-600">
            {formatDate(inspected.snapshot.captured_at)} · <strong className="text-blue-700">{formatCount(inspected.value)}</strong>
            {inspected.snapshot.is_baseline === 1 ? ' (Immutable Baseline)' : ''}
          </span>
        )}
      </div>

      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block select-none" role="img" aria-label={`${label} historical chart`}>
          <defs>
            <linearGradient id="vrBlueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, i) => {
            const y = padTop + (1 - (tick - minVal) / range) * (height - padTop - padBottom);
            return (
              <g key={i}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatCompact(Math.round(tick))}
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#vrBlueFill)" />}
          {coords.length > 1 && (
            <path d={linePath} fill="none" stroke="#1D4ED8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {coords.map((c, idx) => {
            const isSelected = inspected?.snapshot.id === c.snapshot.id;
            return (
              <g key={c.snapshot.id} className="cursor-pointer" onClick={() => setActiveIndex(idx)} onMouseEnter={() => setActiveIndex(idx)}>
                <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 5.5 : 4}
                  fill={c.snapshot.is_baseline === 1 ? '#0F172A' : '#FFFFFF'}
                  stroke="#1D4ED8"
                  strokeWidth="2.5"
                />
              </g>
            );
          })}

          {coords.length >= 1 && (
            <text x={coords[0].x} y={height - 10} textAnchor="start" className="fill-slate-500 text-[10px]">
              {formatDate(coords[0].snapshot.captured_at)}
            </text>
          )}
          {coords.length > 1 && (
            <text x={coords[coords.length - 1].x} y={height - 10} textAnchor="end" className="fill-slate-500 text-[10px]">
              {formatDate(coords[coords.length - 1].snapshot.captured_at)}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};
