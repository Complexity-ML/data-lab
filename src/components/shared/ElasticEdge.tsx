import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

export function elasticHorizontalPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const direction = targetX >= sourceX ? 1 : -1
  const lead = 18 * direction
  const distanceX = Math.abs(targetX - sourceX)
  const distanceY = Math.abs(targetY - sourceY)
  const tension = Math.max(48, distanceX * 0.42, distanceY * 0.32)
  const sourceControl = sourceX + tension * direction
  const targetControl = targetX - tension * direction
  return `M ${sourceX} ${sourceY} L ${sourceX + lead} ${sourceY} C ${sourceControl} ${sourceY}, ${targetControl} ${targetY}, ${targetX - lead} ${targetY} L ${targetX} ${targetY}`
}

export function ElasticEdge({ id, label, markerEnd, sourceX, sourceY, style, targetX, targetY }: EdgeProps) {
  const path = elasticHorizontalPath(sourceX, sourceY, targetX, targetY)
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2
  return <>
    <BaseEdge id={id} markerEnd={markerEnd} path={path} style={style} />
    {label !== undefined && <EdgeLabelRenderer><span className="elastic-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span></EdgeLabelRenderer>}
  </>
}
