export function requestTiming(req: Request, functionName: string) {
  const controller = new AbortController();
  const started = performance.now();
  const stages: Record<string, number> = {};
  let firstTextMs: number | undefined;
  let finished = false;
  const cancel = () => controller.abort(req.signal.reason);
  req.signal.addEventListener("abort", cancel, { once: true });
  if (req.signal.aborted) cancel();
  const deadline = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    60_000,
  );
  return {
    signal: controller.signal,
    cancel() {
      controller.abort(new DOMException("Request cancelled", "AbortError"));
    },
    firstText() {
      firstTextMs ??= Math.round(performance.now() - started);
    },
    async measure<T>(stage: string, operation: () => Promise<T>): Promise<T> {
      controller.signal.throwIfAborted();
      const before = performance.now();
      try {
        const result = await operation();
        controller.signal.throwIfAborted();
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw error;
      } finally {
        stages[`${stage}_ms`] = Math.round(performance.now() - before);
      }
    },
    finish(outcome: string) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      req.signal.removeEventListener("abort", cancel);
      console.info("AI request timing", {
        function: functionName,
        outcome,
        total_ms: Math.round(performance.now() - started),
        first_text_ms: firstTextMs,
        ...stages,
      });
    },
  };
}
