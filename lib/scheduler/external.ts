declare global {
  var __speedtestReschedule: (() => void) | undefined;
}

export function requestReschedule(): void {
  globalThis.__speedtestReschedule?.();
}
