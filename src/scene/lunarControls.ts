/** Physical interaction locations in the reconstructed lunar cabin's local
 * frame. Keep these shared with geometry reach tests when the asset changes. */
export const LUNAR_CONTROLS: [string, string, string, [number, number, number], number][] = [
  ['LM-hatch', 'Forward hatch', 'exit-worksite', [0, .43, 1.004], .25],
  ['LM-throttle-up', 'Descent throttle', 'throttle-up', [-.77, 1.25, .12], .06],
  ['LM-throttle-down', 'Descent throttle', 'throttle-down', [-.77, 1.15, .12], .06],
  ['LM-guidance', 'Guidance mode', 'autopilot', [.7, .85, .86], .06],
  ['LM-return', 'Ascent sequence', 'return', [-.7, .85, .86], .06],
  ['LM-seat', 'Crew restraints', 'sit', [-.45, .9, -.3], .25],
];
