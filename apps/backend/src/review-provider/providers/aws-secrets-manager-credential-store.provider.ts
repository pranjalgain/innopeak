import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { getAwsEndpointOverride } from '@common/helpers/aws-endpoint.util';
import type { EnvConfig } from '@config/env.config';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { randomUUID } from 'crypto';

import { CredentialStoreProvider, type StoredCredential } from './credential-store.provider';

const SCHEME = 'aws-sm';

/**
 * The production/AWS credential store — one Secrets Manager secret per connection, referenced from
 * Postgres only by its path. Same client the rest of this codebase already uses for Secrets
 * Manager (`src/config/secrets-bootstrap.ts`), including the Floci endpoint override so the
 * AWS-emulated local stack exercises this path too.
 *
 * One secret per connection, rather than one blob keyed by connection id, so that a single
 * tenant's credential can be rotated, audited or deleted without touching anyone else's — and so
 * that IAM can eventually scope access per-path.
 */
export class AwsSecretsManagerCredentialStoreProvider extends CredentialStoreProvider {
  readonly scheme = SCHEME;
  private readonly logger = new Logger(AwsSecretsManagerCredentialStoreProvider.name);
  private readonly client: SecretsManagerClient;

  constructor(
    private readonly pathPrefix: string,
    configService: ConfigService<EnvConfig>
  ) {
    super();
    const region = configService.get<string>('AWS_REGION') ?? 'us-east-1';
    const endpoint = getAwsEndpointOverride(configService);
    this.client = new SecretsManagerClient({
      region,
      ...(endpoint
        ? { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }
        : {}),
    });
  }

  async put(credential: StoredCredential): Promise<string> {
    const name = `${this.pathPrefix}/${randomUUID()}`;

    await this.client.send(
      new CreateSecretCommand({ Name: name, SecretString: JSON.stringify(credential) })
    );

    return `${SCHEME}:${name}`;
  }

  async update(reference: string, credential: StoredCredential): Promise<void> {
    await this.client.send(
      new PutSecretValueCommand({
        SecretId: this.parseReference(reference),
        SecretString: JSON.stringify(credential),
      })
    );
  }

  async get(reference: string): Promise<StoredCredential | null> {
    try {
      const { SecretString } = await this.client.send(
        new GetSecretValueCommand({ SecretId: this.parseReference(reference) })
      );

      return SecretString ? (JSON.parse(SecretString) as StoredCredential) : null;
    } catch (error) {
      // Only a genuinely absent secret degrades to null (the owner must reconnect). Anything else
      // — a permissions error, a network failure — is rethrown, because swallowing it would turn a
      // transient AWS problem into every tenant being told their Google grant expired.
      if (error instanceof ResourceNotFoundException) {
        this.logger.warn(`Credential ${reference} no longer exists in Secrets Manager.`);
        return null;
      }

      throw error;
    }
  }

  async delete(reference: string): Promise<void> {
    await this.client.send(
      new DeleteSecretCommand({
        SecretId: this.parseReference(reference),
        // Not `ForceDeleteWithoutRecovery` — a disconnect that turns out to be a mistake is
        // recoverable within the retention window, and a scheduled deletion still stops the
        // credential being usable immediately.
        RecoveryWindowInDays: 7,
      })
    );
  }

  private parseReference(reference: string): string {
    const [scheme, ...rest] = reference.split(':');

    if (scheme !== SCHEME || rest.length === 0) {
      throw new Error(
        `Credential reference "${reference}" was not issued by the ${SCHEME} store. This node cannot resolve it.`
      );
    }

    return rest.join(':');
  }
}
