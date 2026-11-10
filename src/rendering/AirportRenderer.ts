import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import type { AirportDefinition, GateDefinition, RunwayDefinition } from '../airport/AirportDefinition'
import type { TaxiwayGraph } from '../airport/TaxiwayGraph'
import { createGroundPlane } from './ground'

const RUNWAY_WIDTH = 7
const RUNWAY_LENGTH_SCALE = 0.02
const TAXIWAY_WIDTH = 2.2
const CENTERLINE_WIDTH = 0.35
const CENTERLINE_HEIGHT = 0.03
const CENTERLINE_LENGTH = 1.6
const RUNWAY_LIGHT_OFFSET = RUNWAY_WIDTH * 0.5 + 0.6
const NODE_HEIGHT = 0
const SURFACE_ELEVATION = 0.02
const APRON_ELEVATION = 0.03
const GATE_MARKER_SIZE = 0.8

const scratchMatrix = new Matrix4()
const scratchVector = new Vector3()

function positionForNode(graph: TaxiwayGraph, nodeId: string): Vector3 {
  const node = graph.nodes.get(nodeId)
  const position = node?.position
  return new Vector3(position?.x ?? 0, position?.y ?? NODE_HEIGHT, position?.z ?? 0)
}

function terminalAnchorFromGates(gates: readonly GateDefinition[]): Vector3 {
  if (gates.length === 0) {
    return new Vector3(0, 1.5, 0)
  }

  let sumX = 0
  let sumZ = 0
  for (const gate of gates) {
    sumX += gate.position?.x ?? 0
    sumZ += gate.position?.z ?? 0
  }

  return new Vector3(sumX / gates.length + 6, 1.5, sumZ / gates.length)
}

function airportExtent(airport: AirportDefinition): { center: Vector3; size: number } {
  const points: Vector3[] = [
    ...airport.gates.map((gate) => new Vector3(gate.position?.x ?? 0, 0, gate.position?.z ?? 0)),
    ...airport.waypoints.map((waypoint) => new Vector3(waypoint.position?.x ?? 0, 0, waypoint.position?.z ?? 0)),
    ...airport.holdingPoints.map((holdingPoint) => new Vector3(holdingPoint.position?.x ?? 0, 0, holdingPoint.position?.z ?? 0)),
    ...airport.runways.map((runway) => new Vector3(runway.position?.x ?? 0, 0, runway.position?.z ?? 0)),
  ]

  if (points.length === 0) {
    return { center: new Vector3(), size: 200 }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }

  const width = maxX - minX
  const depth = maxZ - minZ
  const center = new Vector3((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5)
  const size = Math.max(width, depth, 120) + 80
  return { center, size }
}

export class AirportRenderer {
  readonly group = new Group()

  constructor(private readonly airport: AirportDefinition, private readonly graph: TaxiwayGraph) {
    this.group.name = 'airport-renderer'
    this.build()
  }

  private build(): void {
    const { center, size } = airportExtent(this.airport)
    const terrain = createGroundPlane(size)
    terrain.position.copy(center)
    this.group.add(terrain)

    this.group.add(this.createRunways())
    this.group.add(this.createCenterlineMarkings())
    this.group.add(this.createTaxiways())
    this.group.add(this.createApron())
    this.group.add(this.createTerminalBlock())
    this.group.add(this.createGates())
    this.group.add(this.createRunwayLights())
  }

  private createRunways(): Group {
    const runwayGroup = new Group()
    runwayGroup.name = 'runways'

    for (const runway of this.airport.runways) {
      const length = Math.max(20, runway.length * RUNWAY_LENGTH_SCALE)
      const geometry = new BoxGeometry(length, 0.05, RUNWAY_WIDTH)
      const material = new MeshStandardMaterial({ color: 0x333333 })
      const runwayMesh = new Mesh(geometry, material)
      runwayMesh.position.set(runway.position?.x ?? 0, SURFACE_ELEVATION, runway.position?.z ?? 0)
      runwayMesh.rotation.y = Math.PI / 2 - (runway.heading * Math.PI) / 180
      runwayMesh.receiveShadow = true
      runwayGroup.add(runwayMesh)
    }

    return runwayGroup
  }

  private createCenterlineMarkings(): Group {
    const centerlineGroup = new Group()
    centerlineGroup.name = 'centerline-markings'
    const markerGeometry = new BoxGeometry(CENTERLINE_LENGTH, CENTERLINE_HEIGHT, CENTERLINE_WIDTH)
    const markerMaterial = new MeshStandardMaterial({ color: 0xf5f5f5 })

    for (const runway of this.airport.runways) {
      const runwayLength = Math.max(20, runway.length * RUNWAY_LENGTH_SCALE)
      const markerCount = Math.max(8, Math.floor(runwayLength / 2.5))
      const markers = new InstancedMesh(markerGeometry, markerMaterial, markerCount)
      const headingRadians = (runway.heading * Math.PI) / 180
      const along = new Vector3(Math.sin(headingRadians), 0, Math.cos(headingRadians))
      const rotationY = Math.PI / 2 - headingRadians
      const startOffset = -(runwayLength / 2) + 1.5
      const spacing = (runwayLength - 3) / markerCount

      for (let index = 0; index < markerCount; index += 1) {
        const offset = startOffset + index * spacing
        scratchVector.set(runway.position?.x ?? 0, SURFACE_ELEVATION + 0.03, runway.position?.z ?? 0)
        scratchVector.addScaledVector(along, offset)
        scratchMatrix.makeRotationY(rotationY)
        scratchMatrix.setPosition(scratchVector)
        markers.setMatrixAt(index, scratchMatrix)
      }

      markers.instanceMatrix.needsUpdate = true
      centerlineGroup.add(markers)
    }

    return centerlineGroup
  }

  private createTaxiways(): Group {
    const taxiwayGroup = new Group()
    taxiwayGroup.name = 'taxiways'

    for (const edge of this.graph.edges.values()) {
      const from = positionForNode(this.graph, edge.from)
      const to = positionForNode(this.graph, edge.to)
      const direction = to.clone().sub(from)
      const length = Math.max(direction.length(), 1.5)
      const midpoint = from.clone().add(to).multiplyScalar(0.5)
      const geometry = new BoxGeometry(length, 0.04, TAXIWAY_WIDTH)
      const material = new MeshStandardMaterial({ color: edge.blocked ? 0xaa5522 : 0x555555 })
      const segment = new Mesh(geometry, material)
      segment.position.set(midpoint.x, SURFACE_ELEVATION + 0.01, midpoint.z)
      segment.rotation.y = Math.atan2(direction.x, direction.z)
      segment.receiveShadow = true
      taxiwayGroup.add(segment)
    }

    return taxiwayGroup
  }

  private createApron(): Mesh<PlaneGeometry, MeshStandardMaterial> {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY

    for (const gate of this.airport.gates) {
      const x = gate.position?.x ?? 0
      const z = gate.position?.z ?? 0
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }

    const width = Number.isFinite(minX) ? Math.max(20, maxX - minX + 18) : 24
    const depth = Number.isFinite(minZ) ? Math.max(14, maxZ - minZ + 14) : 18
    const centerX = Number.isFinite(minX) ? (minX + maxX) * 0.5 + 4 : 0
    const centerZ = Number.isFinite(minZ) ? (minZ + maxZ) * 0.5 : 0

    const apron = new Mesh(
      new PlaneGeometry(width, depth),
      new MeshStandardMaterial({ color: 0x6d6d6d, roughness: 0.9 }),
    )
    apron.rotation.x = -Math.PI / 2
    apron.position.set(centerX, APRON_ELEVATION, centerZ)
    return apron
  }

  private createTerminalBlock(): Mesh<BoxGeometry, MeshStandardMaterial> {
    const anchor = terminalAnchorFromGates(this.airport.gates)
    const terminal = new Mesh(
      new BoxGeometry(18, 3, 10),
      new MeshStandardMaterial({ color: 0xb9c8d0 }),
    )
    terminal.position.copy(anchor)
    terminal.castShadow = true
    terminal.receiveShadow = true
    return terminal
  }

  private createGates(): InstancedMesh {
    const gateGeometry = new BoxGeometry(GATE_MARKER_SIZE, 0.25, GATE_MARKER_SIZE)
    const gateMaterial = new MeshStandardMaterial({ color: 0x3a7cbf })
    const gates = new InstancedMesh(gateGeometry, gateMaterial, this.airport.gates.length)
    gates.name = 'gates'

    this.airport.gates.forEach((gate, index) => {
      scratchMatrix.makeTranslation(gate.position?.x ?? 0, SURFACE_ELEVATION + 0.2, gate.position?.z ?? 0)
      gates.setMatrixAt(index, scratchMatrix)
    })

    gates.instanceMatrix.needsUpdate = true
    return gates
  }

  private createRunwayLights(): Group {
    const lightsGroup = new Group()
    lightsGroup.name = 'runway-lights'
    const lightGeometry = new BoxGeometry(0.2, 0.2, 0.2)
    const lightMaterial = new MeshStandardMaterial({ color: 0xe0f4ff, emissive: 0x86b9d6, emissiveIntensity: 0.7 })

    for (const runway of this.airport.runways) {
      lightsGroup.add(this.createRunwayEdgeLights(runway, lightGeometry, lightMaterial))
    }

    return lightsGroup
  }

  private createRunwayEdgeLights(
    runway: RunwayDefinition,
    geometry: BoxGeometry,
    material: MeshStandardMaterial,
  ): InstancedMesh {
    const runwayLength = Math.max(20, runway.length * RUNWAY_LENGTH_SCALE)
    const perSide = Math.max(10, Math.floor(runwayLength / 2.4))
    const instanceCount = perSide * 2
    const lightInstances = new InstancedMesh(geometry, material, instanceCount)
    const headingRadians = (runway.heading * Math.PI) / 180
    const along = new Vector3(Math.sin(headingRadians), 0, Math.cos(headingRadians))
    const right = new Vector3(along.z, 0, -along.x)
    const startOffset = -runwayLength / 2
    const spacing = runwayLength / (perSide - 1)
    const runwayCenter = new Vector3(runway.position?.x ?? 0, SURFACE_ELEVATION + 0.18, runway.position?.z ?? 0)

    for (let index = 0; index < perSide; index += 1) {
      const alongOffset = startOffset + spacing * index
      const centerPoint = runwayCenter.clone().addScaledVector(along, alongOffset)

      scratchMatrix.makeTranslation(
        centerPoint.x + right.x * RUNWAY_LIGHT_OFFSET,
        runwayCenter.y,
        centerPoint.z + right.z * RUNWAY_LIGHT_OFFSET,
      )
      lightInstances.setMatrixAt(index, scratchMatrix)

      scratchMatrix.makeTranslation(
        centerPoint.x - right.x * RUNWAY_LIGHT_OFFSET,
        runwayCenter.y,
        centerPoint.z - right.z * RUNWAY_LIGHT_OFFSET,
      )
      lightInstances.setMatrixAt(index + perSide, scratchMatrix)
    }

    lightInstances.instanceMatrix.needsUpdate = true
    return lightInstances
  }
}
