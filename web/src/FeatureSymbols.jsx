import { cmToPx, wallSegment, doorArcPath } from './geometry.js';
import { featureChip } from './features.js';

// Draws a room's wall attachments as standard floor-plan symbols on the SVG canvas.
// Door = wall gap (opening) + swing arc, window = double line on the wall, outlet = a dot on the wall.
// Vertical (height) info can't be shown on a top-down plan, so it's surfaced via a click-to-toggle chip.
export function FeatureSymbols({ room, selectedId = null, onSelect = () => {} }) {
  return (room.features ?? []).map((f) => {
    const seg = wallSegment(room, f.wall, f.offset_cm, f.width_cm ?? 0);
    const selected = selectedId === f.id;
    const common = {
      className: `feat-sym feat-${f.kind}${selected ? ' selected' : ''}`,
      'data-testid': `feat-${f.id}`,
      onClick: () => onSelect(f.id),
    };
    const midX = cmToPx((seg.x1 + seg.x2) / 2);
    const midY = cmToPx((seg.y1 + seg.y2) / 2);
    const chip = selected && (
      <text className="feat-chip" x={midX} y={midY - 10} textAnchor="middle">{featureChip(f)}</text>
    );

    if (f.kind === 'door') {
      return (
        <g key={f.id} {...common}>
          <line className="door-gap" x1={cmToPx(seg.x1)} y1={cmToPx(seg.y1)} x2={cmToPx(seg.x2)} y2={cmToPx(seg.y2)} />
          <path className="door-arc" d={doorArcPath(room, f)} />
          {chip}
        </g>
      );
    }
    if (f.kind === 'window') {
      const vertical = f.wall === 'E' || f.wall === 'W';
      const ox = vertical ? 2 : 0;
      const oy = vertical ? 0 : 2;
      return (
        <g key={f.id} {...common}>
          <line className="win-line" x1={cmToPx(seg.x1) - ox} y1={cmToPx(seg.y1) - oy} x2={cmToPx(seg.x2) - ox} y2={cmToPx(seg.y2) - oy} />
          <line className="win-line" x1={cmToPx(seg.x1) + ox} y1={cmToPx(seg.y1) + oy} x2={cmToPx(seg.x2) + ox} y2={cmToPx(seg.y2) + oy} />
          {chip}
        </g>
      );
    }
    return (
      <g key={f.id} {...common}>
        <circle className="outlet-dot" cx={cmToPx(seg.x1)} cy={cmToPx(seg.y1)} r={4} />
        {chip}
      </g>
    );
  });
}
