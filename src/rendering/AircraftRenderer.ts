import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { AircraftSimulationState } from './RenderState'
import { sampleRoute } from './routeSampling'
import type { TaxiwayGraph } from '../airport/TaxiwayGraph'

export interface AircraftVisualState {
  id: string
  position: Vector3
  heading: number
}

const BODY_HEIGHT = 0.45
const AIRCRAFT_Y = 0.35

const scratchMatrix = new Matrix4()
const scratchPosition = new Vector3()
const scratchScale = new Vector3(1, 1, 1)
const scratchQuaternion = new Quaternion()

export class AircraftRenderer {
  readonly group = new Group()

  private readonly instances: InstancedMesh
  private readonly visualStates = new Map<string, AircraftVisualState>()

  constructor(private readonly graph: TaxiwayGraph, maxAircraft = 64) {
    this.group.name = 'aircraft-renderer'
    this.instances = new InstancedMesh(
      new BoxGeometry(1.4, BODY_HEIGHT, 0.7),
      new MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.6, metalness: 0.1 }),
      maxAircraft,
    )
    this.instances.count = 0
    this.group.add(this.instances)
  }

  sync(aircraft: readonly AircraftSimulationState[]): void {
    this.visualStates.clear()
    const instanceCount = Math.min(aircraft.length, this.instances.instanceMatrix.count)
    this.instances.count = instanceCount

    for (let index = 0; index < instanceCount; index += 1) {
      const aircraftState = aircraft[index]
      if (!aircraftState) {
        continue
      }

      const sample = sampleRoute(this.graph, aircraftState.routeNodeIds, aircraftState.routeDistance)
      scratchPosition.copy(sample.position)
      scratchPosition.y = AIRCRAFT_Y
      scratchQuaternion.setFromAxisAngle(new Vector3(0, 1, 0), sample.heading)
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale)
      this.instances.setMatrixAt(index, scratchMatrix)

      this.visualStates.set(aircraftState.id, {
        id: aircraftState.id,
        position: sample.position,
        heading: sample.heading,
      })
    }

    this.instances.instanceMatrix.needsUpdate = true
  }

  getAircraftVisualState(aircraftId: string): AircraftVisualState | undefined {
    const state = this.visualStates.get(aircraftId)
    if (!state) {
      return undefined
    }

    return {
      id: state.id,
      position: state.position.clone(),
      heading: state.heading,
    }
  }
}
