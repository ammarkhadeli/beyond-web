/** CPU triangle/raycast checks with the shipped cabin. No textures are loaded,
 * pixels rendered, or browser controls exercised by this fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Ray } from '@babylonjs/core/Culling/ray';
import { AstronautRig } from '../src/scene/AstronautRig';
import { SceneInteractions } from '../src/scene/SceneInteractions';
import { LUNAR_CONTROLS } from '../src/scene/lunarControls';

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera('lunar crew eye', Vector3.Zero(), scene);
  const cabin = new TransformNode('LM crew compartment', scene);
  cabin.rotation.y = Math.PI;
  const data = readFileSync(new URL('../public/assets/lunar-cabin.glb', import.meta.url));
  const jsonSize = data.readUInt32LE(12), doc = JSON.parse(data.subarray(20, 20 + jsonSize).toString()), bin = 28 + jsonSize;
  const read = (index: number) => {
    const a = doc.accessors[index], b = doc.bufferViews[a.bufferView];
    const width = a.type === 'VEC3' ? 3 : 1, bytes = a.componentType === 5123 ? 2 : 4, result: number[] = [];
    assert.ok(a.componentType === 5126 || a.componentType === 5125 || a.componentType === 5123);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) {
      const offset = bin + (b.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (b.byteStride ?? width * bytes) + j * bytes;
      result.push(a.componentType === 5126 ? data.readFloatLE(offset) : bytes === 2 ? data.readUInt16LE(offset) : data.readUInt32LE(offset));
    }
    return result;
  };
  const conversion = new TransformNode('glTF handedness conversion', scene);
  conversion.parent = cabin; conversion.scaling.z = -1;
  // A real opaque material is required: Babylon otherwise falls back to mesh
  // bounds, which falsely blocks gaps inside consolidated material meshes.
  const material = new StandardMaterial('opaque triangle picking', scene);
  const nodes: TransformNode[] = doc.nodes.map((node: { name: string; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; mesh?: number }) => {
    const parent = new TransformNode(node.name, scene); parent.parent = conversion;
    if (node.translation) parent.position = Vector3.FromArray(node.translation);
    if (node.rotation) parent.rotationQuaternion = Quaternion.FromArray(node.rotation);
    if (node.scale) parent.scaling = Vector3.FromArray(node.scale);
    if (node.matrix) Matrix.FromArray(node.matrix).decompose(parent.scaling, parent.rotationQuaternion = Quaternion.Identity(), parent.position);
    if (node.mesh !== undefined) for (const primitive of doc.meshes[node.mesh].primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'fixture expects triangle primitives');
      const mesh = new Mesh(node.name + ' triangles', scene); mesh.parent = parent; mesh.material = material;
      mesh.setVerticesData(VertexBuffer.PositionKind, read(primitive.attributes.POSITION)); mesh.setIndices(read(primitive.indices));
    }
    return parent;
  });
  doc.nodes.forEach((node: { children?: number[] }, i: number) => { for (const child of node.children ?? []) nodes[child].parent = nodes[i]; });
  const interactions = new SceneInteractions(scene, camera);
  for (const [id, label, action, point, radius] of LUNAR_CONTROLS) interactions.register({ id, label, description: label, action, parent: cabin, position: Vector3.FromArray(point), radius, reach: 2.4, kind: id === 'LM-hatch' ? 'hatch' : 'control', enabled: () => true });
  const rig = new AstronautRig(); rig.setSeat(new Vector3(-.45, 1.65, -.45), Quaternion.RotationAxis(Vector3.Right(), .16));
  rig.setFrame(Vector3.Zero(), Quaternion.RotationAxis(Vector3.Up(), Math.PI));
  rig.setWalkableRegion({ minX: -.96, maxX: .96, minZ: -.92, maxZ: .65, minY: 1.2, maxY: 1.9 }, () => 0);
  const aim = (id: string) => {
    const zone = LUNAR_CONTROLS.find(z => z[0] === id)!;
    const target = Vector3.TransformCoordinates(Vector3.FromArray(zone[3]), cabin.computeWorldMatrix(true));
    camera.position.copyFrom(rig.getPose().position); camera.setTarget(target); camera.getViewMatrix(true); camera.getProjectionMatrix(true); camera.computeWorldMatrix();
    for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
    return target;
  };
  return { engine, scene, rig, camera, interactions, aim, material };
}

test('lunar hatch is reachable after releasing restraints and opaque geometry still blocks the same ray', () => {
  const f = fixture();
  try {
    f.rig.setMode('cabin', 'lunar'); f.rig.step(.1);
    const target = f.aim('LM-hatch');
    assert.equal(f.interactions.activate()?.action, 'exit-worksite');
    const obstacle = MeshBuilder.CreateBox('temporary solid obstruction', { size: .25 }, f.scene);
    obstacle.position = Vector3.Lerp(f.camera.position, target, .4); obstacle.material = f.material; obstacle.computeWorldMatrix(true);
    const delta = target.subtract(f.camera.position), ray = new Ray(f.camera.position, delta.normalizeToNew(), delta.length());
    const hit = f.scene.pickWithRay(ray, mesh => mesh === obstacle);
    assert.ok(hit?.pickedPoint, 'must test triangles rather than bounds');
    assert.notEqual(f.interactions.query()?.action, 'exit-worksite', 'interaction must not penetrate opaque cabin surfaces');
  } finally { f.scene.dispose(); f.engine.dispose(); }
});

test('boarding the lunar cabin permits reseating and reaching the ascent control', () => {
  const f = fixture();
  try {
    f.rig.setMode('eva', 'lunar'); f.rig.setMode('cabin', 'lunar'); f.rig.step(.1);
    f.aim('LM-seat'); assert.equal(f.interactions.activate()?.action, 'sit');
    f.rig.setMode('seated', 'lunar'); f.aim('LM-return');
    assert.equal(f.interactions.activate()?.action, 'return');
  } finally { f.scene.dispose(); f.engine.dispose(); }
});
