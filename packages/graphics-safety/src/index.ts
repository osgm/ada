import type { VisualCandidate } from "@ada/vision-contracts";

export interface GraphicsSafetyPolicy {
  enabled: boolean;
  minConfidence: number;
  fallbackOnSemanticFailure: boolean;
}

export interface GraphicsSafetyDecision {
  allowed: boolean;
  reason: string;
}

export function evaluateGraphicsCandidate(
  candidate: VisualCandidate | undefined,
  policy: GraphicsSafetyPolicy
): GraphicsSafetyDecision {
  if (!policy.enabled) {
    return { allowed: false, reason: "graphics disabled by policy" };
  }
  if (!candidate) {
    return {
      allowed: Boolean(policy.fallbackOnSemanticFailure),
      reason: policy.fallbackOnSemanticFailure ? "candidate missing, fallback allowed" : "candidate missing"
    };
  }
  if (candidate.confidence < policy.minConfidence) {
    return { allowed: false, reason: `low confidence: ${candidate.confidence}` };
  }
  return { allowed: true, reason: "candidate accepted" };
}
