export type Settings={quality:'high'|'low';sensitivity:number;voice:boolean;sound:boolean;beginnerPauses:boolean};
export const DEFAULT_SETTINGS:Settings={quality:'high',sensitivity:1.6,voice:true,sound:true,beginnerPauses:true};
export function normalizeSettings(value:unknown):Settings{
  const p=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const boolean=(key:keyof Settings)=>typeof p[key]==='boolean'?p[key] as boolean:DEFAULT_SETTINGS[key] as boolean;
  return {quality:p.quality==='low'?'low':'high',sensitivity:typeof p.sensitivity==='number'&&Number.isFinite(p.sensitivity)?Math.min(4,Math.max(.3,p.sensitivity)):1.6,voice:boolean('voice'),sound:boolean('sound'),beginnerPauses:boolean('beginnerPauses')};
}
