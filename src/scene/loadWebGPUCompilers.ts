type GlslangCompiler = {
  compileGLSL(source: string, stage: string, debug?: boolean, version?: string): Uint32Array;
};
type TwgslCompiler = {convertSpirV2WGSL(code: Uint32Array, disableUniformityAnalysis?: boolean): string};
export type WebGPUCompilers = {glslang: GlslangCompiler; twgsl: TwgslCompiler};

type CompilerName = 'glslang' | 'twgsl';
type CompilerRuntime = {
  compileGLSL?: GlslangCompiler['compileGLSL'];
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _spirv_to_wgsl(pointer: number, byteLength: number): void;
  _return_string_callback?: (pointer: number, byteLength: number) => void;
};
type RuntimeFactory = (options: {
  locateFile: () => string;
  instantiateWasm: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => WebAssembly.Exports;
  onRuntimeInitialized: (this: CompilerRuntime) => void;
  onAbort: (reason: unknown) => void;
}) => unknown;

const COMPILER_TIMEOUT_MS = 30_000;
let cached: Promise<WebGPUCompilers> | undefined;
const asset = (name: CompilerName, extension: 'js' | 'wasm') => `/assets/shaders/${name}.${extension}`;
const abortReason = (signal: AbortSignal) => signal.reason instanceof Error ? signal.reason : new Error('WebGPU compiler loading was cancelled.');

function loadScript(name: CompilerName, signal: AbortSignal): Promise<RuntimeFactory> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortReason(signal)); return; }
    const scope = self as typeof self & {Module?: RuntimeFactory};
    const previousFactory = scope.Module;
    const script = document.createElement('script');
    script.src = asset(name, 'js');
    script.async = true;
    const cleanup = () => {
      script.onload = script.onerror = null;
      signal.removeEventListener('abort', abort);
      script.remove();
    };
    const abort = () => { cleanup(); reject(abortReason(signal)); };
    script.onload = () => {
      const factory = scope.Module;
      cleanup();
      if (typeof factory !== 'function' || factory === previousFactory) {
        reject(new Error(`WebGPU compiler script did not expose its runtime: ${script.src}`));
      } else resolve(factory);
    };
    script.onerror = () => { cleanup(); reject(new Error(`Could not load WebGPU compiler script: ${script.src}`)); };
    signal.addEventListener('abort', abort, {once: true});
    document.head.appendChild(script);
  });
}

async function loadRuntime(name: CompilerName, signal: AbortSignal): Promise<{runtime: CompilerRuntime}> {
  const wasmPath = asset(name, 'wasm');
  const [factory, binary] = await Promise.all([
    loadScript(name, signal),
    fetch(wasmPath, {signal}).then(response => {
      if (!response.ok) throw new Error(`Could not load WebGPU compiler WASM: ${wasmPath} (HTTP ${response.status})`);
      return response.arrayBuffer();
    }),
  ]);
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortReason(signal)); return; }
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(new Error(`Could not initialize WebGPU compiler ${name}: ${reason instanceof Error ? reason.message : String(reason)}`, {cause: reason}));
    };
    const abort = () => fail(abortReason(signal));
    signal.addEventListener('abort', abort, {once: true});
    try {
      factory({
        locateFile: () => wasmPath,
        // The vendor's self.glslang/self.twgsl wrappers only resolve and can
        // remain pending after WASM failures. Use their unchanged Emscripten
        // runtime with an explicit, rejecting instantiation path instead.
        instantiateWasm: (imports, receive) => {
          void WebAssembly.instantiate(binary, imports).then(({instance, module}) => {
            if (!settled) receive(instance, module);
          }).catch(fail);
          return {};
        },
        onRuntimeInitialized() {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', abort);
          // glslang's runtime is itself a thenable; wrap it to avoid recursive
          // Promise assimilation of the Emscripten module.
          resolve({runtime: this});
        },
        onAbort: fail,
      });
    } catch (error) { fail(error); }
  });
}

async function loadCompilers(): Promise<WebGPUCompilers> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error('WebGPU compiler loading timed out after 30 seconds.')), COMPILER_TIMEOUT_MS);
  try {
    // Both vendor scripts declare the global Module factory. Capture and
    // initialize each in order so the two runtimes cannot replace one another.
    const {runtime: glslangRuntime} = await loadRuntime('glslang', controller.signal);
    if (typeof glslangRuntime.compileGLSL !== 'function') throw new Error('The glslang compiler did not initialize.');
    const {runtime: twgslRuntime} = await loadRuntime('twgsl', controller.signal);
    if (typeof twgslRuntime._malloc !== 'function' || typeof twgslRuntime._free !== 'function' || typeof twgslRuntime._spirv_to_wgsl !== 'function') {
      throw new Error('The twgsl compiler did not initialize.');
    }
    let translated = '';
    const decoder = new TextDecoder();
    twgslRuntime._return_string_callback = (pointer, length) => {
      translated = decoder.decode(twgslRuntime.HEAPU8.subarray(pointer, pointer + length));
    };
    return {
      glslang: {compileGLSL: glslangRuntime.compileGLSL.bind(glslangRuntime)},
      twgsl: {
        convertSpirV2WGSL(code) {
          const pointer = twgslRuntime._malloc(code.byteLength);
          try {
            twgslRuntime.HEAPU32.set(code, pointer / 4);
            translated = '';
            twgslRuntime._spirv_to_wgsl(pointer, code.byteLength);
            return translated;
          } finally { twgslRuntime._free(pointer); }
        },
      },
    };
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally { window.clearTimeout(timer); }
}

/** Resolve both local compilers before creating a WebGPU canvas context.
 * Successful/concurrent calls share one load; failures permit a fresh retry. */
export function loadWebGPUCompilers(): Promise<WebGPUCompilers> {
  if (!cached) cached = loadCompilers().catch(error => { cached = undefined; throw error; });
  return cached;
}
