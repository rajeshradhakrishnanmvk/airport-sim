export type AirportNodeType = 'gate' | 'waypoint' | 'holding-point' | 'runway' | 'taxiway'

export interface Coordinates {
  x: number
  y: number
  z: number
}

export interface IdentifiedEntity {
  id: string
  name: string
}

export interface AirportPositionedEntity extends IdentifiedEntity {
  position?: Coordinates | undefined
}

export interface RunwayDefinition extends AirportPositionedEntity {
  type: 'runway'
  length: number
  heading: number
  threshold?: string
  holdShortNodeId?: string
}

export interface TaxiwaySegmentDefinition {
  id: string
  from: string
  to: string
  length: number
  blocked?: boolean
}

export interface TaxiwayDefinition extends AirportPositionedEntity {
  type: 'taxiway'
  segments: TaxiwaySegmentDefinition[]
}

export interface GateDefinition extends AirportPositionedEntity {
  type: 'gate'
  terminal?: string
}

export interface WaypointDefinition extends AirportPositionedEntity {
  type: 'waypoint'
}

export interface HoldingPointDefinition extends AirportPositionedEntity {
  type: 'holding-point'
  runwayId?: string
}

export interface AirportDefinition {
  id: string
  name: string
  runways: RunwayDefinition[]
  taxiways: TaxiwayDefinition[]
  gates: GateDefinition[]
  waypoints: WaypointDefinition[]
  holdingPoints: HoldingPointDefinition[]
}

export interface GraphNodeRecord {
  id: string
  type: AirportNodeType
  label: string
  position?: Coordinates | undefined
}

export interface GraphEdgeRecord {
  id: string
  from: string
  to: string
  length: number
  taxiwayId?: string
  blocked: boolean
}

export interface AirportRouteStep {
  from: string
  to: string
  length: number
  taxiwayId?: string
}
