import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';

/** Keep hardware clipping linear while the fragment shader writes logarithmic
 * depth. WebGPU clips Z to [0,W]; nonlinear per-vertex log Z otherwise cuts a
 * visible wedge out of large terrain triangles that cross the eye plane. */
export class TerrainLogDepthClipping extends MaterialPluginBase {
  constructor(material:PBRMaterial) {
    super(material,'TerrainLogDepthClipping',200,{},true,true);
  }

  override isCompatible(language:ShaderLanguage) {
    return language===ShaderLanguage.WGSL;
  }

  override getCustomCode(shaderType:string,language:ShaderLanguage) {
    if(shaderType!=='vertex'||language!==ShaderLanguage.WGSL)return null;
    return {CUSTOM_VERTEX_MAIN_END:`
#ifdef LOGARITHMICDEPTH
vertexOutputs.position.z=(scene.viewProjection*worldPos).z;
#endif
`};
  }
}
