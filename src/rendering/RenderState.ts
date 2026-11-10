import type { AirportDefinition } from '../airport/AirportDefinition'
import type { TaxiwayGraph } from '../airport/TaxiwayGraph'

export interface AircraftSimulationState {
  id: string
  callsign: string
  routeNodeIds: readonly string[]
  routeDistance: number
}

export interface SimulationRenderState {
  airport: AirportDefinition
  graph: TaxiwayGraph
  aircraft: readonly AircraftSimulationState[]
  activeAircraftId?: string
}
