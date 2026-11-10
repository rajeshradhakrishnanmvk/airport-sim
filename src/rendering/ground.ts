import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'

export const GROUND_COLOR = 0x228b22

export function createGroundPlane(size = 200): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const geometry = new PlaneGeometry(size, size)
  const material = new MeshStandardMaterial({ color: GROUND_COLOR })
  const plane = new Mesh(geometry, material)
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  return plane
}
