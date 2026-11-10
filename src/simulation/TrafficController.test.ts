import { describe, expect, it } from 'vitest'
import type { AirportDefinition } from '../airport/AirportDefinition'
import { TrafficController } from './TrafficController'

function createTestAirport(): AirportDefinition {
  return {
    id: 'test-airport',
    name: 'Test Airport',
    runways: [
      {
        id: 'RWY09',
        name: 'Runway 09',
        type: 'runway',
        length: 3000,
        heading: 90,
        holdShortNodeId: 'HP_RWY09',
        position: { x: 0, y: 0, z: 0 },
      },
    ],
    taxiways: [
      {
        id: 'TWY_A',
        name: 'Taxiway A',
        type: 'taxiway',
        segments: [
          { id: 'TWY_A_GA', from: 'GATE_A', to: 'WP_A', length: 120 },
          { id: 'TWY_A_GB', from: 'GATE_B', to: 'WP_A', length: 130 },
          { id: 'TWY_A_HOLD', from: 'WP_A', to: 'HP_RWY09', length: 190 },
        ],
      },
    ],
    gates: [
      { id: 'GATE_A', name: 'Gate A', type: 'gate', position: { x: 12, y: 0, z: 8 } },
      { id: 'GATE_B', name: 'Gate B', type: 'gate', position: { x: 20, y: 0, z: 10 } },
    ],
    waypoints: [{ id: 'WP_A', name: 'Waypoint A', type: 'waypoint', position: { x: 38, y: 0, z: 10 } }],
    holdingPoints: [
      {
        id: 'HP_RWY09',
        name: 'Hold Short RWY09',
        type: 'holding-point',
        runwayId: 'RWY09',
        position: { x: 58, y: 0, z: 10 },
      },
    ],
  }
}

function runSimulation(
  controller: TrafficController,
  totalSeconds: number,
  stepSeconds: number,
): {
  sawHoldingShort: boolean
  sawArrivalHold: boolean
  sawLandingClearance: boolean
  maxRunwayUsers: number
} {
  let sawHoldingShort = false
  let sawArrivalHold = false
  let sawLandingClearance = false
  let maxRunwayUsers = 0

  const steps = Math.ceil(totalSeconds / stepSeconds)
  for (let index = 0; index < steps; index += 1) {
    controller.update(stepSeconds)
    const runwayUsers = controller.aircraft.filter(
      (aircraft) => aircraft.state === 'cleared-takeoff' || aircraft.state === 'cleared-landing',
    ).length
    maxRunwayUsers = Math.max(maxRunwayUsers, runwayUsers)
    sawHoldingShort ||= controller.aircraft.some((aircraft) => aircraft.state === 'holding-short')
    sawArrivalHold ||= controller.aircraft.some((aircraft) => aircraft.state === 'arrival-hold')
    sawLandingClearance ||= controller.aircraft.some((aircraft) => aircraft.state === 'cleared-landing')
  }

  return {
    sawHoldingShort,
    sawArrivalHold,
    sawLandingClearance,
    maxRunwayUsers,
  }
}

describe('TrafficController integration flows', () => {
  it('sequences departures with holding and runway clearances', () => {
    const controller = new TrafficController(createTestAirport(), {
      schedule: {
        departureIntervalSeconds: 5,
        arrivalIntervalSeconds: 120,
      },
      taxiSpeed: 30,
      takeoffSpeed: 52,
      landingSpeed: 40,
      runwayOccupancySeconds: 8,
      turnaroundSeconds: 2,
      maxActiveAircraft: 8,
    })

    const results = runSimulation(controller, 150, 1)

    expect(results.sawHoldingShort).toBe(true)
    expect(controller.completedDepartures).toBeGreaterThanOrEqual(3)
    expect(results.maxRunwayUsers).toBeLessThanOrEqual(1)
  })

  it('handles arrival landings and taxi-in without runway conflicts', () => {
    const controller = new TrafficController(createTestAirport(), {
      schedule: {
        departureIntervalSeconds: 60,
        arrivalIntervalSeconds: 5,
      },
      taxiSpeed: 30,
      takeoffSpeed: 52,
      landingSpeed: 44,
      runwayOccupancySeconds: 8,
      turnaroundSeconds: 2,
      maxActiveAircraft: 8,
    })

    const results = runSimulation(controller, 170, 1)

    expect(results.sawArrivalHold).toBe(true)
    expect(results.sawLandingClearance).toBe(true)
    expect(controller.completedArrivals).toBeGreaterThanOrEqual(3)
    expect(results.maxRunwayUsers).toBeLessThanOrEqual(1)
  })
})
