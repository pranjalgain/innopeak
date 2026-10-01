import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { InviteMemberDto } from '../dto/invite-member.dto';
import { TenantMemberResponseDto } from '../dto/tenant-member-response.dto';

const TENANT_MEMBER_EXAMPLE = {
  id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
  name: 'sam.rivera@thecoffeehouse.com',
  email: 'sam.rivera@thecoffeehouse.com',
  role: 'member',
  status: 'invited',
  invitedAt: '2026-03-01T09:12:00.000Z',
};

export function ApiListTenantMembers(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "List this tenant's team, owner included",
      description:
        "Every `users` row for the caller's own tenant — the owner (created at signup, never " +
        'invited) and every member, invited or active. Oldest-first, so the owner leads the list.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [TenantMemberResponseDto],
      examples: { default: { summary: 'Team roster', value: [TENANT_MEMBER_EXAMPLE] } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Not this tenant's owner" })
  );
}

export function ApiInviteMember(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Invite a teammate',
      description:
        'Creates the invited member\'s own row (`status: "invited"`, no password, `role: "member"`) ' +
        'and a 7-day invite token, then emails the invite link. Refused with 403 while ' +
        '`platform_settings.invite_members_enabled` is off.',
    }),
    ApiBody({
      type: InviteMemberDto,
      examples: {
        default: { summary: 'Typical request', value: { email: 'sam.rivera@thecoffeehouse.com' } },
      },
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      type: TenantMemberResponseDto,
      examples: { default: { summary: 'Invite created', value: TENANT_MEMBER_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: "Not this tenant's owner, or invites are disabled platform-wide",
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'This email already has a live invite, or already belongs to an account',
    })
  );
}

export function ApiRevokeMemberInvite(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Revoke a pending invite',
      description:
        "Deletes the invited member's row outright — only while it is still `invited`. A member " +
        'who has already accepted cannot be removed through this route.',
    }),
    ApiParam({ name: 'memberId', description: "The invited member's `users.id`" }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Invite revoked.',
      schema: {
        properties: { message: { type: 'string', example: 'Invite revoked.' } },
      },
      examples: { default: { summary: 'Invite revoked', value: { message: 'Invite revoked.' } } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Not this tenant's owner" }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such member in this tenant' }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'The member exists but is no longer in the invited state',
    })
  );
}

export function ApiRequestMemberRemoval(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Request removal of an active team member',
      description:
        'Revokes access immediately (`status: "disabled"`). The member\'s data is not deleted yet ' +
        '— actual anonymization runs in a nightly job once `ERASURE_GRACE_PERIOD_DAYS` has passed, ' +
        "and the request can be cancelled any time before then. Refused for the tenant's last " +
        'remaining owner, and for removing your own account (use a different flow for that).',
    }),
    ApiParam({ name: 'memberId', description: "The member's `users.id`" }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Removal requested.',
      schema: {
        properties: {
          message: {
            type: 'string',
            example:
              'Removal requested. This member loses access now, and their data is permanently ' +
              'erased in 21 days unless you cancel first.',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Last remaining owner, or self-removal',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Not this tenant's owner" }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such member in this tenant' })
  );
}

export function ApiCancelMemberRemoval(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Cancel a pending team-member removal',
      description:
        'Restores access (`status: "active"`) and clears the pending marker — a clean, full undo, ' +
        'since nothing is anonymized until the grace period actually elapses.',
    }),
    ApiParam({ name: 'memberId', description: "The member's `users.id`" }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Removal cancelled.',
      schema: {
        properties: {
          message: {
            type: 'string',
            example: 'Removal cancelled — this member keeps their access.',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: "Not this tenant's owner" }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such member in this tenant' }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: 'This member has no pending removal' })
  );
}
