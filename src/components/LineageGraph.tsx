import { useEffect, useMemo, useRef } from 'react'
import {
  Background,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { ArrowRight, GitBranch, Maximize, Minus, Plus } from 'lucide-react'
import type { WorkspaceSnapshot } from '../../shared/contracts'
import { artifactTitle, fields, humanStatus } from '../presentation'
import '@xyflow/react/dist/style.css'

function sourceOf(
  snapshot: WorkspaceSnapshot,
  id: string,
  seen = new Set<string>(),
): string | undefined {
  if (seen.has(id)) return
  seen.add(id)
  const artifact = snapshot.artifacts.find((a) => a.id === id)
  if (artifact?.kind === 'source') return id
  for (const input of artifact?.inputIds ?? []) {
    const source = sourceOf(snapshot, input, seen)
    if (source) return source
  }
}

export default function LineageGraph({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const canvas = useRef<HTMLDivElement>(null)
  const flow = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      void flow.current?.fitView({ padding: 0.15 })
    })
    observer.observe(canvas.current!)
    return () => observer.disconnect()
  }, [])
  const currentSources = snapshot.artifacts.filter((a) => a.kind === 'source' && a.isCurrent)
  const { nodes, edges, visible, source } = useMemo(() => {
    const selected = snapshot.artifacts.find((a) => a.id === selectedId)
    const selectedSource = selected ? sourceOf(snapshot, selected.id) : undefined
    const lastChange = [...snapshot.changes].sort((a, b) => b.revision - a.revision)[0]
    const defaultSource = snapshot.artifacts.some((a) => a.isCurrent && a.status === 'stale')
      ? lastChange?.oldSourceId
      : undefined
    const sourceId =
      selectedSource ??
      defaultSource ??
      snapshot.artifacts.find(
        (a) => a.isCurrent && a.kind === 'source' && fields(a).category === 'return-policy',
      )?.id
    const source = snapshot.artifacts.find((a) => a.id === sourceId)
    const ids = new Set(sourceId ? [sourceId] : [])
    let changed = true
    while (changed) {
      changed = false
      for (const artifact of snapshot.artifacts)
        if (!ids.has(artifact.id) && artifact.inputIds.some((id) => ids.has(id))) {
          ids.add(artifact.id)
          changed = true
        }
    }
    const visible = snapshot.artifacts.filter((a) => ids.has(a.id))
    const graph = new dagre.graphlib.Graph()
      .setGraph({ rankdir: 'TB', nodesep: 22, ranksep: 42, marginx: 10, marginy: 12 })
      .setDefaultEdgeLabel(() => ({}))
    for (const artifact of visible) graph.setNode(artifact.id, { width: 170, height: 76 })
    const edges: Edge[] = snapshot.edges
      .filter((edge) => edge.type === 'DEPENDS_ON' && ids.has(edge.from) && ids.has(edge.to))
      .map((edge) => ({
        id: `${edge.to}:${edge.from}`,
        source: edge.to,
        target: edge.from,
        ariaRole: 'img' as const,
        ariaLabel: `${artifactTitle(
          snapshot.artifacts.find((a) => a.id === edge.to)!,
          snapshot,
        )} supplies ${artifactTitle(
          snapshot.artifacts.find((a) => a.id === edge.from)!,
          snapshot,
        )}`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      }))
    for (const edge of edges) graph.setEdge(edge.source, edge.target)
    dagre.layout(graph)
    const nodes: Node[] = visible.map((artifact) => {
      const position = graph.node(artifact.id)
      return {
        id: artifact.id,
        position: { x: position.x - 85, y: position.y - 38 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        selected: artifact.id === selectedId,
        className: `artifact-node node-${artifact.status}${artifact.needsReview ? ' node-review' : ''}`,
        ariaRole: 'group' as const,
        data: {
          label: (
            <button
              className="graph-artifact-button"
              aria-label={`${artifactTitle(artifact, snapshot)}, version ${artifact.version}, ${humanStatus(artifact)}`}
              onClick={() => onSelect(artifact.id)}
            >
              <span className="graph-node-kind">
                {artifact.kind} <span>v{artifact.version}</span>
              </span>
              <strong>{artifactTitle(artifact, snapshot)}</strong>
              <span className="graph-node-status">{humanStatus(artifact)}</span>
            </button>
          ),
        },
      }
    })
    nodes.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    return { nodes, edges, visible, source }
  }, [snapshot, selectedId, onSelect])

  return (
    <section className="panel lineage-panel" aria-label="Recorded dependency graph">
      <div className="section-heading">
        <div className="section-title">
          <GitBranch size={18} aria-hidden="true" />
          <h2>Dependency graph</h2>
        </div>
        <span className="quiet-label">{visible.length} artifacts</span>
      </div>
      <div className="graph-tabs">
        {currentSources.map((a) => (
          <button
            key={a.id}
            aria-pressed={source?.logicalId === a.logicalId}
            onClick={() => onSelect(a.id)}
          >
            {String(fields(a).title)}
          </button>
        ))}
      </div>
      <p className="graph-caption">
        {source
          ? `${String(fields(source).title)} · version ${source.version}`
          : 'Record work to connect your inputs'}{' '}
        <span>
          Input <ArrowRight size={12} aria-hidden="true" /> Output
        </span>
      </p>
      <div className="graph-canvas" ref={canvas}>
        <ReactFlow
          key={source?.id}
          nodes={nodes}
          edges={edges}
          onInit={(instance) => {
            flow.current = instance
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={1.8}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          disableKeyboardA11y
          deleteKeyCode={null}
          onNodeClick={(_event, node) => onSelect(node.id)}
          aria-label="Inputs connected to their generated outputs"
        >
          <Background gap={18} size={1} color="#d6dce6" />
        </ReactFlow>
        <div className="flow-controls" role="group" aria-label="Graph view controls">
          <button aria-label="Zoom in" onClick={() => void flow.current?.zoomIn()}>
            <Plus size={17} aria-hidden="true" />
          </button>
          <button aria-label="Zoom out" onClick={() => void flow.current?.zoomOut()}>
            <Minus size={17} aria-hidden="true" />
          </button>
          <button
            aria-label="Fit view"
            onClick={() => void flow.current?.fitView({ padding: 0.15 })}
          >
            <Maximize size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <details className="path-list">
        <summary>View recorded inputs as a list</summary>
        <ul>
          {visible
            .filter((a) => a.inputIds.length)
            .map((artifact) => (
              <li key={artifact.id}>
                <button onClick={() => onSelect(artifact.id)}>
                  {artifactTitle(artifact, snapshot)}{' '}
                  <span className="mono">v{artifact.version}</span>
                </button>
                <ul>
                  {artifact.inputIds.map((id) => {
                    const input = snapshot.artifacts.find((a) => a.id === id)!
                    return (
                      <li key={id}>
                        <ArrowRight size={12} aria-hidden="true" />
                        <button onClick={() => onSelect(id)}>
                          {artifactTitle(input, snapshot)} · v{input.version}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
        </ul>
      </details>
      <p className="graph-footnote">Links record the exact input versions supplied to each step.</p>
    </section>
  )
}
