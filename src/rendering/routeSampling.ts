import { MathUtils, Vector3 } from 'three'
import type { TaxiwayGraph } from '../airport/TaxiwayGraph'

const DEFAULT_NODE_HEIGHT = 0
const EDGE_LENGTH_FALLBACK = 1

export interface RouteSample {
  position: Vector3
  heading: number
}

function nodeVector(graph: TaxiwayGraph, nodeId: string): Vector3 {
  const node = graph.nodes.get(nodeId)
  const position = node?.position
  return new Vector3(position?.x ?? 0, position?.y ?? DEFAULT_NODE_HEIGHT, position?.z ?? 0)
}

function segmentLength(graph: TaxiwayGraph, from: string, to: string, start: Vector3, end: Vector3): number {
  const edge = [...graph.edges.values()].find((candidate) => candidate.from === from && candidate.to === to)
  if (edge) {
    return Math.max(edge.length, EDGE_LENGTH_FALLBACK)
  }

  return Math.max(start.distanceTo(end), EDGE_LENGTH_FALLBACK)
}

export function getRouteLength(graph: TaxiwayGraph, routeNodeIds: readonly string[]): number {
  if (routeNodeIds.length < 2) {
    return 0
  }

  let totalLength = 0
  for (let index = 0; index < routeNodeIds.length - 1; index += 1) {
    const fromNodeId = routeNodeIds[index]
    const toNodeId = routeNodeIds[index + 1]
    if (!fromNodeId || !toNodeId) {
      continue
    }

    const fromPosition = nodeVector(graph, fromNodeId)
    const toPosition = nodeVector(graph, toNodeId)
    totalLength += segmentLength(graph, fromNodeId, toNodeId, fromPosition, toPosition)
  }

  return totalLength
}

export function sampleRoute(graph: TaxiwayGraph, routeNodeIds: readonly string[], routeDistance: number): RouteSample {
  if (routeNodeIds.length === 0) {
    return { position: new Vector3(), heading: 0 }
  }

  if (routeNodeIds.length === 1) {
    const firstNodeId = routeNodeIds[0]
    return { position: nodeVector(graph, firstNodeId ?? ''), heading: 0 }
  }

  const routeLength = getRouteLength(graph, routeNodeIds)
  if (routeLength <= 0) {
    const firstNodeId = routeNodeIds[0]
    return { position: nodeVector(graph, firstNodeId ?? ''), heading: 0 }
  }

  const loopedDistance = MathUtils.euclideanModulo(routeDistance, routeLength)
  let traversed = 0

  for (let index = 0; index < routeNodeIds.length - 1; index += 1) {
    const fromNodeId = routeNodeIds[index]
    const toNodeId = routeNodeIds[index + 1]
    if (!fromNodeId || !toNodeId) {
      continue
    }

    const fromPosition = nodeVector(graph, fromNodeId)
    const toPosition = nodeVector(graph, toNodeId)
    const currentSegmentLength = segmentLength(graph, fromNodeId, toNodeId, fromPosition, toPosition)
    const nextTraversed = traversed + currentSegmentLength

    if (loopedDistance <= nextTraversed || index === routeNodeIds.length - 2) {
      const segmentProgress = (loopedDistance - traversed) / currentSegmentLength
      const clampedProgress = MathUtils.clamp(segmentProgress, 0, 1)
      const position = fromPosition.lerp(toPosition, clampedProgress)
      const direction = toPosition.clone().sub(fromPosition)
      const heading = Math.atan2(direction.x, direction.z)
      return { position, heading }
    }

    traversed = nextTraversed
  }

  const lastNodeId = routeNodeIds[routeNodeIds.length - 1]
  return { position: nodeVector(graph, lastNodeId ?? ''), heading: 0 }
}
