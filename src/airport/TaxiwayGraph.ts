import type {
  AirportDefinition,
  GraphEdgeRecord,
  GraphNodeRecord,
  TaxiwayDefinition,
} from './AirportDefinition'

export type GraphEdgeIdentifier = string | { from: string; to: string }

export class TaxiwayGraph {
  readonly nodes = new Map<string, GraphNodeRecord>()
  readonly edges = new Map<string, GraphEdgeRecord>()

  constructor(airportDefinition?: AirportDefinition) {
    if (airportDefinition) {
      this.loadDefinition(airportDefinition)
    }
  }

  static fromAirportDefinition(airportDefinition: AirportDefinition): TaxiwayGraph {
    return new TaxiwayGraph(airportDefinition)
  }

  loadDefinition(airportDefinition: AirportDefinition): void {
    for (const gate of airportDefinition.gates) {
      this.addNode({
        id: gate.id,
        type: 'gate',
        label: gate.name,
        position: gate.position,
      })
    }

    for (const waypoint of airportDefinition.waypoints) {
      this.addNode({
        id: waypoint.id,
        type: 'waypoint',
        label: waypoint.name,
        position: waypoint.position,
      })
    }

    for (const holdingPoint of airportDefinition.holdingPoints) {
      this.addNode({
        id: holdingPoint.id,
        type: 'holding-point',
        label: holdingPoint.name,
        position: holdingPoint.position,
      })
    }

    for (const runway of airportDefinition.runways) {
      this.addNode({
        id: runway.id,
        type: 'runway',
        label: runway.name,
        position: runway.position,
      })
    }

    for (const taxiway of airportDefinition.taxiways) {
      this.addTaxiway(taxiway)
    }
  }

  addNode(node: GraphNodeRecord): void {
    const nextNode: GraphNodeRecord = {
      id: node.id,
      type: node.type,
      label: node.label,
      ...(node.position !== undefined ? { position: node.position } : {}),
    }
    this.nodes.set(nextNode.id, nextNode)
  }

  addTaxiway(taxiway: TaxiwayDefinition): void {
    for (const segment of taxiway.segments) {
      this.addEdge({
        id: segment.id ?? `${segment.from}->${segment.to}`,
        from: segment.from,
        to: segment.to,
        length: segment.length,
        taxiwayId: taxiway.id,
        blocked: segment.blocked ?? false,
      })
    }
  }

  addEdge(edge: GraphEdgeRecord): void {
    const fromNode = this.nodes.get(edge.from) ?? { id: edge.from, type: 'taxiway' as const, label: edge.from }
    const toNode = this.nodes.get(edge.to) ?? { id: edge.to, type: 'taxiway' as const, label: edge.to }
    this.nodes.set(edge.from, fromNode)
    this.nodes.set(edge.to, toNode)
    this.edges.set(edge.id, edge)
  }

  getNeighbors(nodeId: string): GraphEdgeRecord[] {
    return [...this.edges.values()].filter((edge) => edge.from === nodeId)
  }

  blockEdge(identifier: GraphEdgeIdentifier, blocked = true): GraphEdgeRecord | undefined {
    const edge = this.findEdge(identifier)
    if (!edge) {
      return undefined
    }

    const nextEdge: GraphEdgeRecord = { ...edge, blocked }
    this.edges.set(edge.id, nextEdge)
    return nextEdge
  }

  unblockEdge(identifier: GraphEdgeIdentifier): GraphEdgeRecord | undefined {
    return this.blockEdge(identifier, false)
  }

  findEdge(identifier: GraphEdgeIdentifier): GraphEdgeRecord | undefined {
    if (typeof identifier === 'string') {
      return this.edges.get(identifier)
    }

    return [...this.edges.values()].find(
      (edge) => edge.from === identifier.from && edge.to === identifier.to,
    )
  }

  route(fromNodeId: string, toNodeId: string): string[] | null {
    if (fromNodeId === toNodeId) {
      return [fromNodeId]
    }

    const queue: Array<{ nodeId: string; cost: number }> = [{ nodeId: fromNodeId, cost: 0 }]
    const bestCost = new Map<string, number>([[fromNodeId, 0]])
    const previous = new Map<string, string | null>([[fromNodeId, null]])

    while (queue.length > 0) {
      queue.sort((left, right) => left.cost - right.cost)
      const current = queue.shift()
      if (!current) {
        break
      }

      if (current.nodeId === toNodeId) {
        break
      }

      for (const edge of this.getNeighbors(current.nodeId)) {
        if (edge.blocked) {
          continue
        }

        const nextCost = current.cost + edge.length
        const previousBest = bestCost.get(edge.to)
        if (previousBest === undefined || nextCost < previousBest) {
          bestCost.set(edge.to, nextCost)
          previous.set(edge.to, current.nodeId)
          queue.push({ nodeId: edge.to, cost: nextCost })
        }
      }
    }

    if (!previous.has(toNodeId)) {
      return null
    }

    const path: string[] = []
    for (let nodeId: string | null = toNodeId; nodeId !== null; nodeId = previous.get(nodeId) ?? null) {
      path.push(nodeId)
    }

    return path.reverse()
  }

  shortestPath(fromNodeId: string, toNodeId: string): string[] | null {
    return this.route(fromNodeId, toNodeId)
  }

  findShortestPath(fromNodeId: string, toNodeId: string): string[] | null {
    return this.route(fromNodeId, toNodeId)
  }

  hasRoute(fromNodeId: string, toNodeId: string): boolean {
    return this.route(fromNodeId, toNodeId) !== null
  }
}
