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
import {
  AirportRenderer,
  AircraftRenderer,
  CameraController,
  type CameraMode,
} from './rendering'
import { TrafficController } from './simulation/TrafficController'

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('App root #app not found')
}

const appRoot = appElement

const scene = new Scene()
const daySky = new Color(0x87ceeb)
const nightSky = new Color(0x040812)
scene.background = daySky.clone()

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
appRoot.appendChild(renderer.domElement)

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

interface SimulationUiElements {
  controlsRoot: HTMLDivElement
  hudRoot: HTMLDivElement
  playPauseButton: HTMLButtonElement
  resetButton: HTMLButtonElement
  speedSelect: HTMLSelectElement
  selectNextButton: HTMLButtonElement
}

interface PlaybackControlsState {
  paused: boolean
  speedMultiplier: number
}

function formatSimulationClock(simulationSeconds: number, dayDurationSeconds: number): string {
  const cyclePosition = ((simulationSeconds % dayDurationSeconds) + dayDurationSeconds) % dayDurationSeconds
  const hoursFloat = (cyclePosition / dayDurationSeconds) * 24
  const hours = Math.floor(hoursFloat)
  const minutes = Math.floor((hoursFloat - hours) * 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function createSimulationUi(appRoot: HTMLElement): SimulationUiElements {
  const controlsRoot = document.createElement('div')
  controlsRoot.className = 'sim-controls'

  const playPauseButton = document.createElement('button')
  playPauseButton.type = 'button'
  playPauseButton.textContent = 'Pause'

  const resetButton = document.createElement('button')
  resetButton.type = 'button'
  resetButton.textContent = 'Reset'

  const selectNextButton = document.createElement('button')
  selectNextButton.type = 'button'
  selectNextButton.textContent = 'Next Aircraft'

  const speedSelect = document.createElement('select')
  speedSelect.setAttribute('aria-label', 'Simulation speed multiplier')
  for (const value of [0.5, 1, 2, 4]) {
    const option = document.createElement('option')
    option.value = String(value)
    option.textContent = `${value}x`
    if (value === 1) {
      option.selected = true
    }
    speedSelect.append(option)
  }

  controlsRoot.append(playPauseButton, resetButton, selectNextButton, speedSelect)

  const hudRoot = document.createElement('div')
  hudRoot.className = 'sim-hud'
  appRoot.append(controlsRoot, hudRoot)

  return {
    controlsRoot,
    hudRoot,
    playPauseButton,
    resetButton,
    speedSelect,
    selectNextButton,
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

function applyDayNightCycle(
  simulation: TrafficController,
  ambient: AmbientLight,
  sunLight: DirectionalLight,
): void {
  const dayDuration = simulation.dayDurationSeconds
  const cycle = (((simulation.simulationTimeSeconds % dayDuration) + dayDuration) % dayDuration) / dayDuration
  const sunAngle = cycle * Math.PI * 2 - Math.PI / 2
  const sunHeight = Math.sin(sunAngle)
  const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.2) / 1.2))
  scene.background = nightSky.clone().lerp(daySky, dayFactor)
  ambient.intensity = 0.2 + dayFactor * 0.8
  sunLight.intensity = 0.1 + dayFactor * 0.9
  sunLight.position.set(Math.cos(sunAngle) * 45, 5 + Math.max(sunHeight, 0) * 40, Math.sin(sunAngle) * 35)
}

function refreshHud(simulation: TrafficController, hudRoot: HTMLElement, controls: PlaybackControlsState): void {
  const snapshot = simulation.snapshotHud()
  hudRoot.innerHTML = [
    `<div><strong>Simulation Time:</strong> ${formatSimulationClock(snapshot.simulationTimeSeconds, simulation.dayDurationSeconds)}</div>`,
    `<div><strong>Aircraft:</strong> ${snapshot.aircraftCount}</div>`,
    `<div><strong>Playback:</strong> ${controls.paused ? 'Paused' : 'Running'} @ ${controls.speedMultiplier.toFixed(1)}x</div>`,
    `<div><strong>Selected:</strong> ${snapshot.selectedAircraftCallsign ?? '-'}</div>`,
    `<div><strong>State:</strong> ${snapshot.selectedAircraftState ?? '-'}</div>`,
    `<div><strong>Speed:</strong> ${snapshot.selectedAircraftSpeed?.toFixed(1) ?? '-'} kt</div>`,
    `<div><strong>Route:</strong> ${snapshot.selectedAircraftRoute ?? '-'}</div>`,
  ].join('')
}

function renderLoop(
  simulation: TrafficController,
  aircraftRenderer: AircraftRenderer,
  cameraController: CameraController,
  ui: SimulationUiElements
): void {
  const clock = new Clock()
  const playbackState: PlaybackControlsState = {
    paused: false,
    speedMultiplier: 1,
  }

  ui.playPauseButton.addEventListener('click', () => {
    playbackState.paused = !playbackState.paused
    ui.playPauseButton.textContent = playbackState.paused ? 'Play' : 'Pause'
  })

  ui.speedSelect.addEventListener('change', () => {
    const nextMultiplier = Number(ui.speedSelect.value)
    if (Number.isFinite(nextMultiplier) && nextMultiplier > 0) {
      playbackState.speedMultiplier = nextMultiplier
    }
  })

  ui.resetButton.addEventListener('click', () => {
    simulation.reset()
    playbackState.paused = false
    playbackState.speedMultiplier = 1
    ui.playPauseButton.textContent = 'Pause'
    ui.speedSelect.value = '1'
    aircraftRenderer.sync(simulation.aircraft)
    refreshHud(simulation, ui.hudRoot, playbackState)
  })

  ui.selectNextButton.addEventListener('click', () => {
    const aircraft = simulation.aircraft
    if (aircraft.length === 0) {
      simulation.setSelectedAircraft(undefined)
      return
    }

    const activeId = simulation.activeAircraftId
    const currentIndex = aircraft.findIndex((entry) => entry.id === activeId)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % aircraft.length : 0
    simulation.setSelectedAircraft(aircraft[nextIndex]?.id)
  })

  function animate(): void {
    requestAnimationFrame(animate)

    const deltaSeconds = clock.getDelta()
    const simulationStep = playbackState.paused ? 0 : deltaSeconds * playbackState.speedMultiplier
    simulation.update(simulationStep)

    aircraftRenderer.sync(simulation.aircraft)
    cameraController.update(simulation)
    applyDayNightCycle(simulation, ambientLight, directionalLight)
    refreshHud(simulation, ui.hudRoot, playbackState)
    renderer.render(scene, camera)
  }
  refreshHud(simulation, ui.hudRoot, playbackState)
  animate()
}

async function bootstrap(): Promise<void> {
  const airport = await loadAirportDefinition()
  const simulation = new TrafficController(airport, {
    schedule: {
      departureIntervalSeconds: 16,
      arrivalIntervalSeconds: 18,
    },
    maxActiveAircraft: 10,
    runwayOccupancySeconds: 9,
    dayDurationSeconds: 240,
  })
  const airportRenderer = new AirportRenderer(simulation.airport, simulation.graph)
  const aircraftRenderer = new AircraftRenderer(simulation.graph)
  const cameraController = new CameraController(camera, controls, aircraftRenderer)
  const ui = createSimulationUi(appRoot)
  const defaultCameraMode: CameraMode = 'orbit'
  cameraController.setMode(defaultCameraMode)

  scene.add(airportRenderer.group)
  scene.add(aircraftRenderer.group)
  aircraftRenderer.sync(simulation.aircraft)
  wireCameraControls(cameraController)
  renderLoop(simulation, aircraftRenderer, cameraController, ui)
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Airport renderer initialization failed: ${message}`)
})
