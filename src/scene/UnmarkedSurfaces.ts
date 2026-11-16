import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

type Region = readonly [number, number, number, number];
// Top-left pixel bounds in the inspected 1024px glTF atlases, including a
// filtering margin. Render plain fabric/metal over insignia, retaining geometry.
const regions: Record<string, readonly Region[]> = {
  suit: [[877, 22, 963, 86], [890, 179, 958, 241], [796, 711, 861, 768], [786, 379, 865, 447]],
  station: [[819, 39, 873, 91]],
  stationDetails: [[227, 302, 258, 337], [442, 200, 598, 308]],
  laboratory: [[751, 307, 803, 349], [634, 275, 697, 335], [129, 75, 181, 124]],
};

class UnmarkedSurface extends MaterialPluginBase {
  constructor(material: PBRMaterial, private profile: keyof typeof regions) {
    // Distinct defines prevent shader-cache sharing across different atlases.
    super(material, 'unmarked surfaces', 200,
      { UNMARKED_SURFACE: Object.keys(regions).indexOf(profile) + 1 }, true, true);
  }
  override isCompatible() { return true; }
  override getClassName() { return 'UnmarkedSurface'; }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== 'fragment') return null;
    const uv = language === ShaderLanguage.WGSL ? 'fragmentInputs.vAlbedoUV' : 'vAlbedoUV';
    const vector = language === ShaderLanguage.WGSL ? 'vec3f' : 'vec3';
    const checks = (regions[this.profile] ?? []).map(([x0, y0, x1, y1]) =>
      `(${uv}.x >= ${(x0 / 1024).toFixed(8)} && ${uv}.x <= ${(x1 / 1024).toFixed(8)} && ${uv}.y >= ${(y0 / 1024).toFixed(8)} && ${uv}.y <= ${(y1 / 1024).toFixed(8)})`);
    return { CUSTOM_FRAGMENT_BEFORE_LIGHTS: checks.length ? `
#ifdef ALBEDO
if (${checks.join(' || ')}) {
  surfaceAlbedo = ${vector}(0.79, 0.80, 0.78);
  normalW = geometricNormalW;
}
#endif
` : '' };
  }
}

export function removeMissionInsignia(meshes: readonly AbstractMesh[], asset: string) {
  const seen = new Set<PBRMaterial>();
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof PBRMaterial)) continue;
    // A separate lunar flag plaque: remove before static merging and cloning.
    if (asset === 'lander' && material.name.startsWith('blinn12SG')) {
      mesh.dispose();
      continue;
    }
    if (seen.has(material)) continue;
    seen.add(material);
    if (asset === 'saturn' && /^blinn(8|9|10)SG/.test(material.name)) {
      material.albedoTexture = null;
      material.albedoColor = Color3.White();
    }
    const profile = asset === 'suit' && material.name.startsWith('astnt1_1') ? 'suit'
      : asset === 'station' && /^(ISS_01_|ecostress_dexter)/.test(material.name) ? 'station'
      : asset === 'station' && material.name.startsWith('ISS_04_dull') ? 'stationDetails'
      : asset === 'interior' && material.name.startsWith('USLab_Racks_03') ? 'laboratory' : null;
    if (profile && !material.pluginManager?.getPlugin('unmarked surfaces')) new UnmarkedSurface(material, profile);
  }
}
