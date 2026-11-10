import './style.css'
import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AirportDefinition } from './airport/AirportDefinition'
import { TaxiwayGraph } from './airport/TaxiwayGraph'
import {
  AirportRenderer,
  AircraftRenderer,
  CameraController,
  getRouteLength,
  type AircraftSimulationState,
  type CameraMode,
  type SimulationRenderState
} from './rendering'

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('App root #app not found')
}

const scene = new Scene()
scene.background = new Color(0x87ceeb)

const camera = new PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.set(20, 20, 20)

const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
appElement.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(30, 0, 12)
controls.enableDamping = true

const ambientLight = new AmbientLight(0xffffff, 0.7)
scene.add(ambientLight)

const directionalLight = new DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(15, 30, 10)
scene.add(directionalLight)

async function loadAirportDefinition(): Promise<AirportDefinition> {
  const url = new URL('./data/airport.kochi.json', import.meta.url)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load airport definition: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as AirportDefinition
}

interface AircraftRuntimeState extends AircraftSimulationState {
  speed: number
  routeLength: number
}

class DemoSimulationState implements SimulationRenderState {
  readonly graph: TaxiwayGraph
  readonly aircraft: readonly AircraftRuntimeState[]
  readonly activeAircraftId: string

  constructor(readonly airport: AirportDefinition) {
    this.graph = TaxiwayGraph.fromAirportDefinition(airport)

    const routes = [
      this.graph.route('GATE_A', 'HP_RWY09'),
      this.graph.route('GATE_B', 'HP_RWY09'),
      this.graph.route('GATE_C', 'WP_B')
    ].filter((route): route is string[] => route !== null)

    const aircraft: AircraftRuntimeState[] = routes.map((routeNodeIds, index) => {
      const routeLength = getRouteLength(this.graph, routeNodeIds)
      const speed = 18 + index * 4
      return {
        id: `AC_${index + 1}`,
        callsign: `AS${index + 101}`,
        routeNodeIds,
        routeDistance: index * 35,
        speed,
        routeLength: Math.max(routeLength, 1)
      }
    })

    this.aircraft = aircraft
    this.activeAircraftId = aircraft[0]?.id ?? 'AC_1'
  }

  update(deltaSeconds: number): void {
    const dynamicAircraft = this.aircraft as AircraftRuntimeState[]
    for (const aircraft of dynamicAircraft) {
      aircraft.routeDistance = (aircraft.routeDistance + aircraft.speed * deltaSeconds) % aircraft.routeLength
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

function wireCameraControls(cameraController: CameraController): void {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Digit1') {
      cameraController.setMode('orbit')
      return
    }
    if (event.code === 'Digit2') {
      cameraController.setMode('chase')
      return
    }
    if (event.code === 'Digit3') {
      cameraController.setMode('top-down')
      return
    }
    if (event.code === 'KeyC') {
      cameraController.cycleMode()
    }
  })
}

function renderLoop(
  simulation: DemoSimulationState,
  aircraftRenderer: AircraftRenderer,
  cameraController: CameraController
): void {
  const clock = new Clock()
  function animate(): void {
    requestAnimationFrame(animate)
    simulation.update(clock.getDelta())
    aircraftRenderer.sync(simulation.aircraft)
    cameraController.update(simulation)
    renderer.render(scene, camera)
  }
  animate()
}

async function bootstrap(): Promise<void> {
  const airport = await loadAirportDefinition()
  const simulation = new DemoSimulationState(airport)
  const airportRenderer = new AirportRenderer(simulation.airport, simulation.graph)
  const aircraftRenderer = new AircraftRenderer(simulation.graph)
  const cameraController = new CameraController(camera, controls, aircraftRenderer)
  const defaultCameraMode: CameraMode = 'orbit'
  cameraController.setMode(defaultCameraMode)

  scene.add(airportRenderer.group)
  scene.add(aircraftRenderer.group)
  aircraftRenderer.sync(simulation.aircraft)
  wireCameraControls(cameraController)
  renderLoop(simulation, aircraftRenderer, cameraController)
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Airport renderer initialization failed: ${message}`)
})
