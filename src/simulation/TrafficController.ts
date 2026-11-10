import type { AirportDefinition } from '../airport/AirportDefinition'
import { TaxiwayGraph } from '../airport/TaxiwayGraph'
import { getRouteLength, type AircraftSimulationState, type SimulationRenderState } from '../rendering'

const DEPARTURE_EXIT_DISTANCE = 180

type AircraftFlow = 'departure' | 'arrival'

export type AircraftOperationalState =
  | 'taxi-out'
  | 'holding-short'
  | 'cleared-takeoff'
  | 'airborne'
  | 'arrival-hold'
  | 'cleared-landing'
  | 'taxi-in'
  | 'parked'

export interface ControlledAircraftState extends AircraftSimulationState {
  speed: number
  state: AircraftOperationalState
  routeLength: number
  flow: AircraftFlow
}

export interface TrafficSchedule {
  departureIntervalSeconds: number
  arrivalIntervalSeconds: number
}

export interface TrafficControllerOptions {
  schedule?: Partial<TrafficSchedule>
  taxiSpeed?: number
  takeoffSpeed?: number
  landingSpeed?: number
  runwayOccupancySeconds?: number
  turnaroundSeconds?: number
  maxActiveAircraft?: number
  dayDurationSeconds?: number
}

export interface HudSnapshot {
  simulationTimeSeconds: number
  aircraftCount: number
  selectedAircraftId: string | undefined
  selectedAircraftCallsign: string | undefined
  selectedAircraftState: AircraftOperationalState | undefined
  selectedAircraftSpeed: number | undefined
  selectedAircraftRoute: string | undefined
}

interface InternalAircraftState extends ControlledAircraftState {
  gateId: string
  clearancesQueued: boolean
  parkedTimeSeconds?: number
}

interface RouteSet {
  departureTaxiRoute: string[]
  arrivalTaxiRoute: string[]
}

const DEFAULT_SCHEDULE: TrafficSchedule = {
  departureIntervalSeconds: 22,
  arrivalIntervalSeconds: 28,
}

export class TrafficController implements SimulationRenderState {
  readonly graph: TaxiwayGraph
  readonly airport: AirportDefinition
  readonly dayDurationSeconds: number

  get aircraft(): readonly ControlledAircraftState[] {
    return this.dynamicAircraft
  }

  get activeAircraftId(): string | undefined {
    return this.selectedAircraftId
  }

  get simulationTimeSeconds(): number {
    return this.elapsedSeconds
  }

  get completedDepartures(): number {
    return this.departureCompletions
  }

  get completedArrivals(): number {
    return this.arrivalCompletions
  }

  readonly schedule: TrafficSchedule
  readonly runwayNodeId: string
  readonly holdShortNodeId: string

  private readonly dynamicAircraft: InternalAircraftState[] = []
  private readonly routesByGate = new Map<string, RouteSet>()
  private readonly departureQueue: string[] = []
  private readonly arrivalQueue: string[] = []
  private readonly aircraftById = new Map<string, InternalAircraftState>()
  private readonly taxiSpeed: number
  private readonly takeoffSpeed: number
  private readonly landingSpeed: number
  private readonly runwayOccupancySeconds: number
  private readonly turnaroundSeconds: number
  private readonly maxActiveAircraft: number
  private readonly gateRotation: string[]
  private readonly approachNodeId: string
  private readonly departureExitNodeId: string

  private nextAircraftSequence = 1
  private nextDepartureSpawnSeconds: number
  private nextArrivalSpawnSeconds: number
  private runwayLockedUntilSeconds = 0
  private elapsedSeconds = 0
  private selectedAircraftId: string | undefined
  private departureCompletions = 0
  private arrivalCompletions = 0
  private gateCursor = 0

  constructor(airport: AirportDefinition, options: TrafficControllerOptions = {}) {
    this.airport = airport
    this.graph = TaxiwayGraph.fromAirportDefinition(airport)

    const runway = airport.runways[0]
    if (!runway) {
      throw new Error('Airport definition must contain at least one runway')
    }

    this.runwayNodeId = runway.id
    this.holdShortNodeId = runway.holdShortNodeId ?? airport.holdingPoints[0]?.id ?? runway.id
    this.approachNodeId = `APPROACH_${runway.id}`
    this.departureExitNodeId = `DEPARTURE_EXIT_${runway.id}`
    this.dayDurationSeconds = Math.max(options.dayDurationSeconds ?? 240, 60)

    this.taxiSpeed = Math.max(options.taxiSpeed ?? 8, 1)
    this.takeoffSpeed = Math.max(options.takeoffSpeed ?? 46, 6)
    this.landingSpeed = Math.max(options.landingSpeed ?? 40, 6)
    this.runwayOccupancySeconds = Math.max(options.runwayOccupancySeconds ?? 10, 2)
    this.turnaroundSeconds = Math.max(options.turnaroundSeconds ?? 8, 1)
    this.maxActiveAircraft = Math.max(options.maxActiveAircraft ?? 10, 2)

    this.schedule = {
      departureIntervalSeconds: Math.max(options.schedule?.departureIntervalSeconds ?? DEFAULT_SCHEDULE.departureIntervalSeconds, 1),
      arrivalIntervalSeconds: Math.max(options.schedule?.arrivalIntervalSeconds ?? DEFAULT_SCHEDULE.arrivalIntervalSeconds, 1),
    }

    this.nextDepartureSpawnSeconds = this.schedule.departureIntervalSeconds
    this.nextArrivalSpawnSeconds = this.schedule.arrivalIntervalSeconds

    this.addSyntheticNodes()
    this.gateRotation = this.buildGateRoutes()
  }

  reset(): void {
    this.dynamicAircraft.length = 0
    this.departureQueue.length = 0
    this.arrivalQueue.length = 0
    this.aircraftById.clear()
    this.nextAircraftSequence = 1
    this.nextDepartureSpawnSeconds = this.schedule.departureIntervalSeconds
    this.nextArrivalSpawnSeconds = this.schedule.arrivalIntervalSeconds
    this.runwayLockedUntilSeconds = 0
    this.elapsedSeconds = 0
    this.selectedAircraftId = undefined
    this.departureCompletions = 0
    this.arrivalCompletions = 0
    this.gateCursor = 0
  }

  update(deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      return
    }

    this.elapsedSeconds += deltaSeconds
    this.spawnScheduledTraffic()
    this.applyRunwaySequencing()
    this.advanceAircraft(deltaSeconds)
    this.pruneCompletedAircraft()
    this.refreshSelection()
  }

  setSelectedAircraft(aircraftId: string | undefined): void {
    if (!aircraftId) {
      this.selectedAircraftId = undefined
      return
    }

    this.selectedAircraftId = this.aircraftById.has(aircraftId) ? aircraftId : undefined
  }

  snapshotHud(): HudSnapshot {
    const selected = this.selectedAircraftId ? this.aircraftById.get(this.selectedAircraftId) : undefined
    return {
      simulationTimeSeconds: this.elapsedSeconds,
      aircraftCount: this.dynamicAircraft.length,
      selectedAircraftId: selected?.id,
      selectedAircraftCallsign: selected?.callsign,
      selectedAircraftState: selected?.state,
      selectedAircraftSpeed: selected?.speed,
      selectedAircraftRoute: selected ? selected.routeNodeIds.join(' → ') : undefined,
    }
  }

  private addSyntheticNodes(): void {
    const runwayNode = this.graph.nodes.get(this.runwayNodeId)
    const holdNode = this.graph.nodes.get(this.holdShortNodeId)
    const runwayPosition = runwayNode?.position ?? { x: 0, y: 0, z: 0 }
    const holdPosition = holdNode?.position ?? runwayPosition

    this.graph.addNode({
      id: this.approachNodeId,
      type: 'waypoint',
      label: 'Approach Fix',
      position: {
        x: runwayPosition.x - DEPARTURE_EXIT_DISTANCE,
        y: runwayPosition.y ?? 0,
        z: runwayPosition.z,
      },
    })

    this.graph.addNode({
      id: this.departureExitNodeId,
      type: 'waypoint',
      label: 'Departure Corridor',
      position: {
        x: runwayPosition.x + DEPARTURE_EXIT_DISTANCE,
        y: runwayPosition.y ?? 0,
        z: runwayPosition.z + Math.max(Math.abs(holdPosition.z - runwayPosition.z), 16),
      },
    })
  }

  private buildGateRoutes(): string[] {
    const availableGates: string[] = []

    for (const gate of this.airport.gates) {
      const departureTaxiRoute = this.graph.route(gate.id, this.holdShortNodeId)
      if (!departureTaxiRoute || departureTaxiRoute.length === 0) {
        continue
      }

      const taxiOut = departureTaxiRoute.at(-1) === this.holdShortNodeId
        ? [...departureTaxiRoute]
        : [...departureTaxiRoute, this.holdShortNodeId]
      const taxiIn = [...taxiOut].reverse()

      this.routesByGate.set(gate.id, {
        departureTaxiRoute: taxiOut,
        arrivalTaxiRoute: taxiIn,
      })
      availableGates.push(gate.id)
    }

    if (availableGates.length === 0) {
      throw new Error('No taxi routes found from gates to runway holding point')
    }

    return availableGates
  }

  private spawnScheduledTraffic(): void {
    while (this.elapsedSeconds >= this.nextDepartureSpawnSeconds) {
      this.nextDepartureSpawnSeconds += this.schedule.departureIntervalSeconds
      if (this.dynamicAircraft.length >= this.maxActiveAircraft) {
        continue
      }
      this.spawnDeparture()
    }

    while (this.elapsedSeconds >= this.nextArrivalSpawnSeconds) {
      this.nextArrivalSpawnSeconds += this.schedule.arrivalIntervalSeconds
      if (this.dynamicAircraft.length >= this.maxActiveAircraft) {
        continue
      }
      this.spawnArrival()
    }
  }

  private spawnDeparture(): void {
    const gateId = this.gateRotation[this.gateCursor % this.gateRotation.length]
    this.gateCursor += 1
    if (!gateId) {
      return
    }

    const routeSet = this.routesByGate.get(gateId)
    if (!routeSet) {
      return
    }

    const aircraft = this.createAircraft(routeSet.departureTaxiRoute, gateId, 'departure', 'taxi-out', this.taxiSpeed)
    this.registerAircraft(aircraft)
  }

  private spawnArrival(): void {
    const gateId = this.gateRotation[(this.gateCursor + this.arrivalCompletions) % this.gateRotation.length]
    if (!gateId) {
      return
    }

    const aircraft = this.createAircraft(
      [this.approachNodeId],
      gateId,
      'arrival',
      'arrival-hold',
      0,
    )
    this.registerAircraft(aircraft)
    this.arrivalQueue.push(aircraft.id)
  }

  private createAircraft(
    routeNodeIds: string[],
    gateId: string,
    flow: AircraftFlow,
    state: AircraftOperationalState,
    speed: number,
  ): InternalAircraftState {
    const sequence = this.nextAircraftSequence
    this.nextAircraftSequence += 1
    const routeLength = Math.max(getRouteLength(this.graph, routeNodeIds), 0.001)
    return {
      id: `AC_${String(sequence).padStart(3, '0')}`,
      callsign: `AS${100 + sequence}`,
      routeNodeIds,
      routeDistance: 0,
      routeLength,
      speed,
      state,
      flow,
      gateId,
      clearancesQueued: false,
    }
  }

  private registerAircraft(aircraft: InternalAircraftState): void {
    this.dynamicAircraft.push(aircraft)
    this.aircraftById.set(aircraft.id, aircraft)
    this.refreshSelection()
  }

  private applyRunwaySequencing(): void {
    if (this.elapsedSeconds < this.runwayLockedUntilSeconds) {
      return
    }

    let nextAircraft = this.dequeueNext(this.arrivalQueue)
    if (nextAircraft) {
      this.clearForLanding(nextAircraft)
      return
    }

    nextAircraft = this.dequeueNext(this.departureQueue)
    if (!nextAircraft) {
      return
    }

    this.clearForTakeoff(nextAircraft)
  }

  private clearForLanding(aircraft: InternalAircraftState): void {
    aircraft.state = 'cleared-landing'
    aircraft.routeNodeIds = [this.approachNodeId, this.runwayNodeId, this.holdShortNodeId]
    aircraft.routeLength = Math.max(getRouteLength(this.graph, aircraft.routeNodeIds), 0.001)
    aircraft.routeDistance = 0
    aircraft.speed = this.landingSpeed
    aircraft.clearancesQueued = false
    this.runwayLockedUntilSeconds = this.elapsedSeconds + this.runwayOccupancySeconds
  }

  private clearForTakeoff(aircraft: InternalAircraftState): void {
    aircraft.state = 'cleared-takeoff'
    aircraft.routeNodeIds = [this.holdShortNodeId, this.runwayNodeId, this.departureExitNodeId]
    aircraft.routeLength = Math.max(getRouteLength(this.graph, aircraft.routeNodeIds), 0.001)
    aircraft.routeDistance = 0
    aircraft.speed = this.takeoffSpeed
    aircraft.clearancesQueued = false
    this.runwayLockedUntilSeconds = this.elapsedSeconds + this.runwayOccupancySeconds
  }

  private dequeueNext(queue: string[]): InternalAircraftState | undefined {
    while (queue.length > 0) {
      const aircraftId = queue.shift()
      if (!aircraftId) {
        return undefined
      }
      const aircraft = this.aircraftById.get(aircraftId)
      if (!aircraft) {
        continue
      }
      return aircraft
    }

    return undefined
  }

  private advanceAircraft(deltaSeconds: number): void {
    for (const aircraft of this.dynamicAircraft) {
      if (aircraft.speed > 0) {
        aircraft.routeDistance = Math.min(aircraft.routeDistance + aircraft.speed * deltaSeconds, aircraft.routeLength)
      }

      if (aircraft.routeDistance + 0.001 < aircraft.routeLength) {
        continue
      }

      this.handleRouteCompletion(aircraft)
    }
  }

  private handleRouteCompletion(aircraft: InternalAircraftState): void {
    if (aircraft.state === 'taxi-out') {
      aircraft.state = 'holding-short'
      aircraft.speed = 0
      aircraft.routeDistance = aircraft.routeLength
      if (!aircraft.clearancesQueued) {
        this.departureQueue.push(aircraft.id)
        aircraft.clearancesQueued = true
      }
      return
    }

    if (aircraft.state === 'cleared-takeoff') {
      aircraft.state = 'airborne'
      aircraft.speed = 0
      aircraft.routeDistance = aircraft.routeLength
      this.departureCompletions += 1
      return
    }

    if (aircraft.state === 'cleared-landing') {
      const routeSet = this.routesByGate.get(aircraft.gateId)
      if (!routeSet) {
        aircraft.state = 'parked'
        aircraft.speed = 0
        aircraft.parkedTimeSeconds = this.elapsedSeconds
        return
      }
      aircraft.state = 'taxi-in'
      aircraft.routeNodeIds = routeSet.arrivalTaxiRoute
      aircraft.routeLength = Math.max(getRouteLength(this.graph, aircraft.routeNodeIds), 0.001)
      aircraft.routeDistance = 0
      aircraft.speed = this.taxiSpeed
      return
    }

    if (aircraft.state === 'taxi-in') {
      aircraft.state = 'parked'
      aircraft.speed = 0
      aircraft.routeDistance = aircraft.routeLength
      aircraft.parkedTimeSeconds = this.elapsedSeconds
      this.arrivalCompletions += 1
    }
  }

  private pruneCompletedAircraft(): void {
    for (let index = this.dynamicAircraft.length - 1; index >= 0; index -= 1) {
      const aircraft = this.dynamicAircraft[index]
      if (!aircraft) {
        continue
      }

      const parkedFor = aircraft.parkedTimeSeconds === undefined ? 0 : this.elapsedSeconds - aircraft.parkedTimeSeconds
      const shouldRemove = aircraft.state === 'airborne' || (aircraft.state === 'parked' && parkedFor >= this.turnaroundSeconds)
      if (!shouldRemove) {
        continue
      }

      this.dynamicAircraft.splice(index, 1)
      this.aircraftById.delete(aircraft.id)
      if (this.selectedAircraftId === aircraft.id) {
        this.selectedAircraftId = undefined
      }
    }
  }

  private refreshSelection(): void {
    if (this.selectedAircraftId && this.aircraftById.has(this.selectedAircraftId)) {
      return
    }

    this.selectedAircraftId = this.dynamicAircraft[0]?.id
  }
}
