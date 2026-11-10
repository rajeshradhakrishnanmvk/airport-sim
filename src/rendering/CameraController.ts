import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AircraftRenderer } from './AircraftRenderer'
import type { SimulationRenderState } from './RenderState'

const CAMERA_LERP_FACTOR = 0.08

export type CameraMode = 'orbit' | 'chase' | 'top-down'

const MODES: readonly CameraMode[] = ['orbit', 'chase', 'top-down']

const chaseOffset = new Vector3(-7, 4.8, -7)
const topDownOffset = new Vector3(0, 70, 0.01)
const scratchLookAt = new Vector3()
const scratchForward = new Vector3()

export class CameraController {
  mode: CameraMode = 'orbit'

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly aircraftRenderer: AircraftRenderer,
  ) {}

  cycleMode(): void {
    const currentIndex = MODES.indexOf(this.mode)
    const nextMode = MODES[(currentIndex + 1) % MODES.length]
    if (!nextMode) {
      return
    }
    this.mode = nextMode
    this.applyModeSettings()
  }

  setMode(mode: CameraMode): void {
    this.mode = mode
    this.applyModeSettings()
  }

  update(state: SimulationRenderState): void {
    if (this.mode === 'orbit') {
      this.controls.update()
      return
    }

    const followedAircraftId = state.activeAircraftId ?? state.aircraft[0]?.id
    if (!followedAircraftId) {
      return
    }

    const aircraft = this.aircraftRenderer.getAircraftVisualState(followedAircraftId)
    if (!aircraft) {
      return
    }

    if (this.mode === 'top-down') {
      this.updateTopDownCamera(aircraft.position)
      return
    }

    this.updateChaseCamera(aircraft.position, aircraft.heading)
  }

  private updateChaseCamera(position: Vector3, heading: number): void {
    const sinHeading = Math.sin(heading)
    const cosHeading = Math.cos(heading)
    const localOffset = chaseOffset
    const worldOffset = new Vector3(
      localOffset.x * cosHeading - localOffset.z * sinHeading,
      localOffset.y,
      localOffset.x * sinHeading + localOffset.z * cosHeading,
    )
    const desiredPosition = position.clone().add(worldOffset)
    this.camera.position.lerp(desiredPosition, CAMERA_LERP_FACTOR)
    scratchLookAt.set(position.x, position.y + 1.2, position.z)
    this.camera.lookAt(scratchLookAt)
  }

  private updateTopDownCamera(position: Vector3): void {
    const desiredPosition = position.clone().add(topDownOffset)
    this.camera.position.lerp(desiredPosition, CAMERA_LERP_FACTOR)
    scratchLookAt.set(position.x, position.y, position.z)
    scratchForward.set(0, 0, -1)
    this.camera.up.copy(scratchForward)
    this.camera.lookAt(scratchLookAt)
  }

  private applyModeSettings(): void {
    if (this.mode === 'orbit') {
      this.controls.enabled = true
      this.camera.up.set(0, 1, 0)
      return
    }

    this.controls.enabled = false
    this.camera.up.set(0, 1, 0)
  }
}
