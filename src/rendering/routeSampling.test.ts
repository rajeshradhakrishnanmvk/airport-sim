import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AirportDefinition } from '../airport/AirportDefinition'
import { TaxiwayGraph } from '../airport/TaxiwayGraph'
import { getRouteLength, sampleRoute } from './routeSampling'

function loadAirportDefinition(): AirportDefinition {
  const filePath = new URL('../data/airport.kochi.json', import.meta.url)
  return JSON.parse(readFileSync(filePath, 'utf8')) as AirportDefinition
}

describe('routeSampling', () => {
  it('returns route start position at distance zero', () => {
    const graph = TaxiwayGraph.fromAirportDefinition(loadAirportDefinition())
    const route = graph.route('GATE_A', 'HP_RWY09')

    expect(route).not.toBeNull()

    const sample = sampleRoute(graph, route ?? [], 0)
    expect(sample.position.x).toBeCloseTo(10)
    expect(sample.position.z).toBeCloseTo(10)
  })

  it('loops route distance beyond route length', () => {
    const graph = TaxiwayGraph.fromAirportDefinition(loadAirportDefinition())
    const route = graph.route('GATE_A', 'HP_RWY09') ?? []
    const routeLength = getRouteLength(graph, route)

    const sampleA = sampleRoute(graph, route, 25)
    const sampleB = sampleRoute(graph, route, routeLength + 25)
    expect(sampleB.position.x).toBeCloseTo(sampleA.position.x)
    expect(sampleB.position.z).toBeCloseTo(sampleA.position.z)
    expect(sampleB.heading).toBeCloseTo(sampleA.heading)
  })
})
