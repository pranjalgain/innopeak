import { PromptDto, PromptVersionDto } from '../dto/prompt-response.dto';
import type { PromptVersionRecord, PromptWithVersions } from '../types/prompt.type';

/** Null when the prompt has no versions — see `PromptsService.list`, which omits those rather than failing. */
export function toPromptDto(row: PromptWithVersions, includeHistory: boolean): PromptDto | null {
  const current = row.versions[row.versions.length - 1];
  if (current === undefined) {
    return null;
  }

  const dto = new PromptDto();
  dto.id = row.prompt.id;
  dto.category = row.prompt.category;
  dto.name = row.prompt.name;
  dto.description = row.prompt.description ?? '';
  dto.currentVersion = PromptVersionDto.from(current);
  dto.tone = row.prompt.tone;
  dto.versionCount = row.versions.length;
  dto.createdAt = row.prompt.createdAt.toISOString();
  dto.updatedAt = row.prompt.updatedAt.toISOString();
  if (includeHistory) {
    dto.versions = row.versions.map((version: PromptVersionRecord) =>
      PromptVersionDto.from(version)
    );
  }
  return dto;
}
