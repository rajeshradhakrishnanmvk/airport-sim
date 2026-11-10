import { MeshStandardMaterial, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { createGroundPlane, GROUND_COLOR } from './scene'

describe('createGroundPlane', () => {
  it('creates a horizontal green ground plane', () => {
    const plane = createGroundPlane()

    expect(plane.geometry).toBeInstanceOf(PlaneGeometry)
    expect(plane.material).toBeInstanceOf(MeshStandardMaterial)
    expect(plane.material.color.getHex()).toBe(GROUND_COLOR)
    expect(plane.rotation.x).toBeCloseTo(-Math.PI / 2)
  })
})
