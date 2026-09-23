import { requireOwner } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockPrompt, nextMockId } from "../state";

interface CreatePromptVersionBody {
  template?: string;
}
interface UpdatePromptToneBody {
  tone?: MockPrompt["tone"];
}
interface PromptStatsBatchBody {
  pairs?: { promptId: string; version: number }[];
}

interface PromptVersionStatsDto {
  totalGenerated: number;
  approvedCount: number;
  approvedAsIsCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  averageDecisionMinutes: number | null;
}

/** Small stable string hash — good enough to turn `${promptId}:${version}` into a deterministic
 *  seed so the same pair always answers with the same numbers (both the single and batch stats
 *  endpoints, and repeat calls across a page's lifetime, must agree). Nothing in the mock db links
 *  a review response back to the prompt/version that generated it, so these are synthesized rather
 *  than aggregated — plausible, stable numbers stand in for a real aggregate query. */
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildVersionStats(promptId: string, version: number): PromptVersionStatsDto {
  const seed = hashSeed(`${promptId}:${String(version)}`);
  const totalGenerated = 8 + (seed % 45);
  const rejectedCount = Math.floor(totalGenerated * (0.05 + ((seed >> 3) % 10) / 100));
  const pendingCount = Math.floor(totalGenerated * (0.05 + ((seed >> 6) % 8) / 100));
  const supersededCount = Math.floor(totalGenerated * (((seed >> 9) % 6) / 100));
  const approvedCount = Math.max(
    0,
    totalGenerated - rejectedCount - pendingCount - supersededCount,
  );
  const approvedEditedCount = Math.floor(approvedCount * (0.2 + ((seed >> 12) % 30) / 100));
  const approvedAsIsCount = approvedCount - approvedEditedCount;
  const decidedCount = approvedCount + rejectedCount;
  const averageDecisionMinutes = decidedCount > 0 ? 4 + ((seed >> 15) % 40) : null;

  return {
    totalGenerated,
    approvedCount,
    approvedAsIsCount,
    approvedEditedCount,
    rejectedCount,
    pendingCount,
    supersededCount,
    averageDecisionMinutes,
  };
}

function toPromptDto(prompt: MockPrompt, includeHistory: boolean) {
  const current = prompt.versions[prompt.versions.length - 1]!;
  return {
    id: prompt.id,
    category: prompt.category,
    name: prompt.name,
    description: prompt.description,
    currentVersion: {
      id: current.id,
      version: current.version,
      template: current.template,
      createdAt: current.createdAt,
      createdBy: current.createdByUserId
        ? { userId: current.createdByUserId, name: current.createdByName }
        : null,
    },
    tone: prompt.tone,
    versionCount: prompt.versions.length,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    ...(includeHistory
      ? {
          versions: prompt.versions.map((version) => ({
            id: version.id,
            version: version.version,
            template: version.template,
            createdAt: version.createdAt,
            createdBy: version.createdByUserId
              ? { userId: version.createdByUserId, name: version.createdByName }
              : null,
          })),
        }
      : {}),
  };
}

export const promptsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/prompts",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const includeHistory = ctx.query.get("includeHistory") === "true";
      const prompts = getDb()
        .prompts.filter((prompt) => prompt.tenantId === auth.tenantId)
        .map((prompt) => toPromptDto(prompt, includeHistory));
      return success({ prompts });
    },
  },
  {
    method: "POST",
    pattern: "/v1/prompts/:promptId/versions",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const prompt = getDb().prompts.find(
        (p) => p.id === ctx.params.promptId && p.tenantId === auth.tenantId,
      );
      if (!prompt) return failure(404, "No such prompt.");
      const body = ctx.body as CreatePromptVersionBody;
      const template = body.template?.trim();
      if (!template) return failure(400, "A template is required.");

      // `mapVersion` (the real, unmodified frontend service) falls back to the "InnoPeak
      // default" label whenever this is null — that's meant for the tenant's untouched starting
      // templates, not for a version someone just saved. The signed-in user's own name is right
      // there in `getDb().users`, so this stays credited correctly rather than reading as if
      // nobody edited it.
      const author = getDb().users.find((user) => user.id === auth.userId);
      const version = {
        id: nextMockId("prompt_version"),
        version: prompt.versions.length + 1,
        template,
        createdAt: new Date().toISOString(),
        createdByUserId: auth.userId,
        createdByName: author?.name ?? null,
      };
      prompt.versions.push(version);
      prompt.updatedAt = version.createdAt;

      return success(
        {
          promptId: prompt.id,
          version: {
            id: version.id,
            version: version.version,
            template: version.template,
            createdAt: version.createdAt,
            createdBy: { userId: version.createdByUserId, name: version.createdByName },
          },
          versionCount: prompt.versions.length,
        },
        "New version saved.",
        201,
      );
    },
  },
  {
    method: "PUT",
    pattern: "/v1/prompts/:promptId/tone",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const prompt = getDb().prompts.find(
        (p) => p.id === ctx.params.promptId && p.tenantId === auth.tenantId,
      );
      if (!prompt) return failure(404, "No such prompt.");
      const body = ctx.body as UpdatePromptToneBody;
      if (!body.tone) return failure(400, "A tone is required.");
      prompt.tone = body.tone;
      return success({ promptId: prompt.id, tone: prompt.tone });
    },
  },
  {
    method: "GET",
    pattern: "/v1/prompts/:promptId/stats",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const prompt = getDb().prompts.find(
        (p) => p.id === ctx.params.promptId && p.tenantId === auth.tenantId,
      );
      if (!prompt) return failure(404, "No such prompt.");

      const versionParam = ctx.query.get("version");
      const current = prompt.versions[prompt.versions.length - 1]!;
      const version = versionParam ? Number(versionParam) : current.version;
      if (!prompt.versions.some((v) => v.version === version)) {
        return failure(404, "No such prompt version.");
      }

      return success(buildVersionStats(prompt.id, version));
    },
  },
  {
    method: "POST",
    pattern: "/v1/prompts/stats/batch",
    handler: (ctx) => {
      requireOwner(ctx.auth);
      const body = ctx.body as PromptStatsBatchBody;
      const results = (body.pairs ?? []).map((pair) => ({
        promptId: pair.promptId,
        version: pair.version,
        stats: buildVersionStats(pair.promptId, pair.version),
      }));
      return success({ results });
    },
  },
]);
