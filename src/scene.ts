import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'

export const GROUND_COLOR = 0x228b22

export function createGroundPlane(): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const geometry = new PlaneGeometry(200, 200)
  const material = new MeshStandardMaterial({ color: GROUND_COLOR })

  const plane = new Mesh(geometry, material)
  plane.rotation.x = -Math.PI / 2

  return plane
}
