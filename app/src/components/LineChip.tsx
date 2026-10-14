import type { Line } from '../lib/data'
import './LineChip.css'

/** Line badge in the line's official colour (neutral fill for lines without one). `big` is the header size. */
export function LineChip({
  name,
  line,
  color,
  textColor,
  big,
}: {
  name: string
  line?: Line
  color?: string
  textColor?: string
  big?: boolean
}) {
  const bg = color || line?.color
  const fg = textColor || line?.text_color
  return (
    <span
      className={big ? 'chip big' : 'chip'}
      style={bg ? { background: `#${bg}`, color: `#${fg || 'ffffff'}`, borderColor: 'transparent' } : undefined}
    >
      {name}
    </span>
  )
}
