// Bridges the platform-independent core (plain number arrays) to Lens Studio objects.
// Every Lens Studio API used here exists in both Lens Studio 5.15 (Spectacles 2024)
// and 5.22+ (SPECS 27); see docs/SETUP_LENS_STUDIO.md.

import type { TriangleMesh } from "../Core/markers";
import type { Quat, Vec3 } from "../Core/geo";

/** Builds an indexed triangle mesh with position and normal attributes. Returns null if empty. */
export function triangleRenderMesh(m: TriangleMesh): RenderMesh | null {
  const count = m.positions.length / 3;
  if (count === 0 || m.indices.length === 0) return null;
  if (count > 65535) throw new Error("mesh has " + count + " vertices; 16-bit indices allow 65535");
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
  ]);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;
  // One interleaved call: x, y, z, nx, ny, nz per vertex (a single native call is cheapest).
  const interleaved: number[] = new Array(count * 6);
  for (let i = 0; i < count; i++) {
    interleaved[6 * i] = m.positions[3 * i];
    interleaved[6 * i + 1] = m.positions[3 * i + 1];
    interleaved[6 * i + 2] = m.positions[3 * i + 2];
    interleaved[6 * i + 3] = m.normals[3 * i];
    interleaved[6 * i + 4] = m.normals[3 * i + 1];
    interleaved[6 * i + 5] = m.normals[3 * i + 2];
  }
  builder.appendVerticesInterleaved(interleaved);
  builder.appendIndices(m.indices);
  if (!builder.isValid()) throw new Error("MeshBuilder rejected the mesh data");
  const mesh = builder.getMesh();
  builder.updateMesh();
  return mesh;
}

/** A child object with its own RenderMeshVisual. New objects inherit the parent's render layer. */
export function createMeshObject(
  name: string,
  parent: SceneObject,
  mesh: RenderMesh | null,
  material: Material,
): RenderMeshVisual {
  const obj = global.scene.createSceneObject(name);
  obj.setParent(parent);
  obj.layer = parent.layer;
  const visual = obj.createComponent("Component.RenderMeshVisual");
  visual.mainMaterial = material;
  if (mesh !== null) visual.mesh = mesh;
  visual.enabled = mesh !== null;
  return visual;
}

export function createEmptyObject(name: string, parent: SceneObject): SceneObject {
  const obj = global.scene.createSceneObject(name);
  obj.setParent(parent);
  obj.layer = parent.layer;
  return obj;
}

/**
 * Per-use copy of the base material with its colour set and its render state pinned.
 * The render state is set in code rather than trusted from the asset: with two-sided
 * rendering on, far-side coastline ribbons would show through as mirror-image continents.
 */
export function tintedMaterial(base: Material, rgb: [number, number, number], alpha = 1): Material {
  const m = base.clone();
  const pass = m.mainPass;
  pass.baseColor = new vec4(rgb[0], rgb[1], rgb[2], alpha);
  pass.twoSided = false;
  pass.cullMode = CullMode.Back;
  pass.depthTest = true;
  pass.depthWrite = true;
  pass.blendMode = BlendMode.Disabled;
  return m;
}

/**
 * Additive, non-depth-writing copy of the base material for glows (atmosphere, newest
 * quakes, epicentre ring). On an additive display this is simply extra light.
 */
export function glowMaterial(base: Material, rgb: [number, number, number]): Material {
  const m = base.clone();
  const pass = m.mainPass;
  pass.baseColor = new vec4(rgb[0], rgb[1], rgb[2], 1);
  pass.twoSided = false;
  pass.cullMode = CullMode.Back;
  pass.depthTest = true;
  pass.depthWrite = false;
  pass.blendMode = BlendMode.Add;
  return m;
}

/** Lens Studio's quat constructor takes (w, x, y, z), unlike most libraries. */
export function toLensQuat(q: Quat): quat {
  return new quat(q.w, q.x, q.y, q.z);
}

export function toLensVec(v: Vec3): vec3 {
  return new vec3(v.x, v.y, v.z);
}

export function fromLensVec(v: vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function fromLensQuat(q: quat): Quat {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}
