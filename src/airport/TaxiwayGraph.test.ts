import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { AirportDefinition } from './AirportDefinition'
import { TaxiwayGraph } from './TaxiwayGraph'

function loadAirportDefinition(): AirportDefinition {
  const filePath = new URL('../data/airport.kochi.json', import.meta.url)
  return JSON.parse(readFileSync(filePath, 'utf8')) as AirportDefinition
}

describe('TaxiwayGraph', () => {
  it('constructs nodes and edges from an airport definition', () => {
    const graph = new TaxiwayGraph(loadAirportDefinition())

    expect(graph.nodes.has('GATE_A')).toBe(true)
    expect(graph.nodes.has('WP_A')).toBe(true)
    expect(graph.nodes.has('HP_RWY09')).toBe(true)
    expect(graph.edges.size).toBe(5)
  })

  it('returns a valid route from a gate to a runway hold-short node', () => {
    const graph = new TaxiwayGraph(loadAirportDefinition())

    expect(graph.route('GATE_A', 'HP_RWY09')).toEqual(['GATE_A', 'WP_A', 'HP_RWY09'])
  })

  it('returns null for unreachable nodes', () => {
    const graph = new TaxiwayGraph(loadAirportDefinition())

    expect(graph.route('GATE_C', 'HP_RWY09')).toBeNull()
  })

  it('rejects routes when a taxiway segment is blocked', () => {
    const graph = new TaxiwayGraph(loadAirportDefinition())
    graph.blockEdge({ from: 'GATE_A', to: 'WP_A' })

    expect(graph.route('GATE_A', 'HP_RWY09')).toBeNull()
    expect(graph.hasRoute('GATE_A', 'HP_RWY09')).toBe(false)
  })
})
