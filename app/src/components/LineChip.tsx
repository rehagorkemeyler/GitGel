import type { Line } from '../lib/data'
import './LineChip.css'

/** Line badge in the line's official colour (grey for lines without one). */
export function LineChip({ name, line, color, textColor }: { name: string; line?: Line; color?: string; textColor?: string }) {
  const bg = color || line?.color
  const fg = textColor || line?.text_color
  return (
    <span
      className="chip"
      style={bg ? { background: `#${bg}`, color: `#${fg || 'ffffff'}`, borderColor: 'transparent' } : undefined}
    >
      {name}
    </span>
  )
}
