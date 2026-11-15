import {Engine} from '@babylonjs/core/Engines/engine';
import {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {_CommonDispose} from '@babylonjs/core/Engines/engine.common';

export type GraphicsPreference = 'auto' | 'webgpu' | 'webgl';
export type GraphicsInfo = {backend: 'WebGPU' | 'WebGL 2' | 'WebGL 1'; requested: GraphicsPreference; fallbackReason: string | null};

/** A canvas cannot switch APIs once WebGPU has acquired its context. React
 * replaces the canvas before the compatibility engine is constructed. */
export class WebGLFallbackRequired extends Error { constructor(message:string){super(message);this.name='WebGLFallbackRequired';} }

/** Keep compiler assets local so packaged/offline builds never need a CDN.
 * Query overrides are useful for comparing the two real rendering backends. */
export async function createGraphicsEngine(canvas: HTMLCanvasElement, initializationFailure: string | null = null): Promise<{engine: AbstractEngine; info: GraphicsInfo}> {
  const override = new URLSearchParams(location.search).get('renderer');
  const requested: GraphicsPreference = override === 'webgl' || override === 'webgpu' ? override : 'auto';
  let fallbackReason: string | null = initializationFailure;
  if (requested !== 'webgl' && !initializationFailure) {
    const {WebGPUEngine} = await import('@babylonjs/core/Engines/webgpuEngine');
    await import('@babylonjs/core/Engines/WebGPU/Extensions/index');
    if (await WebGPUEngine.IsSupportedAsync) {
      let engine: InstanceType<typeof WebGPUEngine> | undefined;
      try {
        const {loadWebGPUCompilers} = await import('./loadWebGPUCompilers');
        const {glslang,twgsl} = await loadWebGPUCompilers();
        engine = new WebGPUEngine(canvas, {
          antialias: true, stencil: true, adaptToDeviceRatio: true, powerPreference: 'high-performance',
          glslangOptions: {glslang:Promise.resolve(glslang)},
          twgslOptions: {twgsl},
        });
        await engine.initAsync();
        await engine.prepareGlslangAndTintAsync();
        return {engine, info:{backend:'WebGPU',requested,fallbackReason:null}};
      } catch (error) {
        try {engine?.dispose();} catch {
          // Babylon 8's WebGPU disposer assumes device initialization finished.
          // Its constructor already installed canvas/document/window listeners.
          engine?._device?.destroy();
          if (engine) {
            _CommonDispose(engine,canvas);
            AbstractEngine.prototype.dispose.call(engine);
          }
        }
        fallbackReason = error instanceof Error ? error.message : String(error);
        if (requested === 'webgpu') throw new Error('WebGPU initialization failed. Open the game with ?renderer=webgl to use the compatibility renderer.', {cause:error});
        throw new WebGLFallbackRequired(fallbackReason);
      }
    } else {
      fallbackReason = 'WebGPU is unavailable in this browser or graphics driver.';
      if (requested === 'webgpu') throw new Error(fallbackReason+' Open the game with ?renderer=webgl to use WebGL.');
    }
  }
  const engine = new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance',adaptToDeviceRatio:true});
  return {engine,info:{backend:engine.webGLVersion>1?'WebGL 2':'WebGL 1',requested,fallbackReason}};
}
