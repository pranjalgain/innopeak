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
]);
