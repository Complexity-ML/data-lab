import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, type Connection, type Edge, type EdgeTypes, type NodeChange, type EdgeChange, type NodeTypes } from '@xyflow/react'
import { PanelLeftOpen, PanelRightOpen, Pencil, Trash2 } from 'lucide-react'
import { useMemo, type DragEvent, type MouseEvent } from 'react'
import { PipelineCard } from '../components/PipelineCard'
import { ElasticEdge } from '../components/shared/ElasticEdge'
import type { CardKind, PipelineNode } from '../domain/pipeline'
import { graphPerformanceTargets } from '../domain/performance'

const nodeTypes: NodeTypes = { pipeline: PipelineCard }
const edgeTypes: EdgeTypes = { elastic: ElasticEdge }
const miniMapColors: Record<CardKind, string> = {
  source: '#bfdbfe', profile: '#a7f3d0', analysis: '#c7d2fe', split: '#ddd6fe', decision: '#e9d5ff',
  transform: '#fef3c7', review: '#fecdd3', validation: '#bbf7d0', output: '#bae6fd',
}

interface PipelineCanvasViewProps {
  contextMenu?: { nodeId: string; label: string; x: number; y: number }
  edges: Edge[]
  inspectorOpen: boolean
  libraryOpen: boolean
  nodes: PipelineNode[]
  onConnect(connection: Connection): void
  onDeleteCard(nodeId: string): void
  onDrop(event: DragEvent<HTMLDivElement>): void
  onEdgesChange(changes: EdgeChange<Edge>[]): void
  onEditCard(nodeId: string, label: string): void
  onFlowInit(instance: { fitView(options?: { duration?: number; padding?: number }): Promise<boolean>; screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number } }): void
  onNodeContextMenu(event: MouseEvent<Element>, node: PipelineNode): void
  onNodesChange(changes: NodeChange<PipelineNode>[]): void
  onOpenInspector(): void
  onOpenLibrary(): void
  onPaneClick(): void
  onSelectNode(nodeId: string): void
  theme: 'light' | 'dark'
}

export function PipelineCanvasView(props: PipelineCanvasViewProps) {
  const { contextMenu, edges, inspectorOpen, libraryOpen, nodes, onConnect, onDeleteCard, onDrop, onEdgesChange, onEditCard, onFlowInit, onNodeContextMenu, onNodesChange, onOpenInspector, onOpenLibrary, onPaneClick, onSelectNode, theme } = props
  const renderedEdges = useMemo(() => edges.map((edge) => ({ ...edge, type: 'elastic', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 1.6 } })), [edges])
  const renderMiniMap = nodes.length <= graphPerformanceTargets.minimapNodeLimit
  return <section aria-label="Pipeline canvas" className="canvas-panel" id="data-lab-canvas" tabIndex={0}>
    {!libraryOpen && <button aria-label="Open card library" className="library-open" onClick={onOpenLibrary} title="Open card library" type="button"><PanelLeftOpen size={16} /><span>Cards</span></button>}
    {!inspectorOpen && <button aria-label="Open inspector" className="inspector-open" onClick={onOpenInspector} title="Open inspector" type="button"><PanelRightOpen size={16} /><span>Inspector</span></button>}
    <div className="canvas-toolbar"><div><span className="live-dot" />Live validation</div><div>{nodes.length} cards <span>·</span> {edges.length} edges</div></div>
    <ReactFlow
      nodes={nodes}
      edges={renderedEdges}
      edgeTypes={edgeTypes}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
      onDrop={onDrop}
      onInit={onFlowInit}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onNodeContextMenu={onNodeContextMenu}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.35}
      maxZoom={1.45}
      nodeDragThreshold={1}
      onlyRenderVisibleElements
      snapToGrid={false}
      defaultEdgeOptions={{ type: 'elastic' }}
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Background color={theme === 'dark' ? '#2a3950' : '#e5eaf0'} gap={24} size={1} variant={BackgroundVariant.Lines} />
      {renderMiniMap && <MiniMap className="minimap" maskColor={theme === 'dark' ? 'rgba(15,23,42,.72)' : 'rgba(248,250,252,.72)'} nodeColor={(node) => miniMapColors[(node.data as PipelineNode['data']).kind]} pannable zoomable />}
      <Controls className="flow-controls" showInteractive={false} />
    </ReactFlow>
    {contextMenu && <div className="card-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      <div><small>CARD</small><strong>{contextMenu.label}</strong></div>
      <button className="context-edit" onClick={() => onEditCard(contextMenu.nodeId, contextMenu.label)} role="menuitem" type="button"><Pencil size={14} /><span><strong>Edit card</strong><small>Open metadata and rules</small></span></button>
      <button className="context-delete" onClick={() => onDeleteCard(contextMenu.nodeId)} role="menuitem" type="button"><Trash2 size={14} /><span><strong>Delete card</strong><small>Also removes attached edges</small></span></button>
    </div>}
  </section>
}
