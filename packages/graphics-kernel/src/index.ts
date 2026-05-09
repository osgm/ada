import {
  evaluateGraphicsCandidate,
  type GraphicsSafetyDecision,
  type GraphicsSafetyPolicy
} from "@ada/graphics-safety";
import type { VisionAdapter, VisualResolutionResult, VisualTarget } from "@ada/vision-contracts";

export interface GraphicsKernelOptions {
  adapter: VisionAdapter;
  policy: GraphicsSafetyPolicy;
}

export interface GraphicsKernelResult {
  resolution: VisualResolutionResult;
  safety: GraphicsSafetyDecision;
}

export class GraphicsKernel {
  constructor(private readonly options: GraphicsKernelOptions) {}

  async resolve(target: VisualTarget): Promise<GraphicsKernelResult> {
    const resolution = await this.options.adapter.resolve(target);
    const safety = evaluateGraphicsCandidate(resolution.candidate, this.options.policy);
    return { resolution, safety };
  }
}

export class NoopVisionAdapter implements VisionAdapter {
  id = "noop-vision-adapter";

  async resolve(): Promise<VisualResolutionResult> {
    return {
      ok: false,
      reason: "no vision adapter configured"
    };
  }
}
