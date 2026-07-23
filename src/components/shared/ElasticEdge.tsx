import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

export function elasticHorizontalPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const direction = targetX >= sourceX ? 1 : -1
  const lead = 18 * direction
  const distanceX = Math.abs(targetX - sourceX)
  // Horizontal adaptation of LABO AI's elastic cable: tension follows the
  // primary axis only, so a tall branch does not produce a huge sideways arc.
  const tension = Math.max(34, distanceX * 0.42)
  const sourceControl = sourceX + tension * direction
  const targetControl = targetX - tension * direction
  return `M ${sourceX} ${sourceY} L ${sourceX + lead} ${sourceY} C ${sourceControl} ${sourceY}, ${targetControl} ${targetY}, ${targetX - lead} ${targetY} L ${targetX} ${targetY}`
}

export function elasticFeedbackPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const lead = 18
  const routeY = Math.max(sourceY, targetY) + 84
  const midpointX = (sourceX + targetX) / 2
  return `M ${sourceX} ${sourceY} L ${sourceX + lead} ${sourceY} C ${sourceX + 72} ${sourceY}, ${sourceX + 72} ${routeY}, ${midpointX} ${routeY} C ${targetX - 72} ${routeY}, ${targetX - 72} ${targetY}, ${targetX - lead} ${targetY} L ${targetX} ${targetY}`
}

export function ElasticEdge({ id, label, markerEnd, selected, sourceHandleId, sourceX, sourceY, style, targetX, targetY }: EdgeProps) {
  const feedback = sourceHandleId === 'feedback' || label === 'next iteration'
  const path = feedback
    ? elasticFeedbackPath(sourceX, sourceY, targetX, targetY)
    : elasticHorizontalPath(sourceX, sourceY, targetX, targetY)
  const labelX = (sourceX + targetX) / 2
  const labelY = feedback ? Math.max(sourceY, targetY) + 84 : (sourceY + targetY) / 2
  const edgeStyle = selected ? { ...style, stroke: '#6366f1', strokeWidth: 2.2 } : style
  return <>
    <BaseEdge id={id} interactionWidth={28} markerEnd={markerEnd} path={path} style={edgeStyle} />
    {label !== undefined && <EdgeLabelRenderer><span className="elastic-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span></EdgeLabelRenderer>}
  </>
}
