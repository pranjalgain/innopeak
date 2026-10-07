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

/** One secret per connection (not one blob) so a tenant's credential can be rotated, audited or deleted independently, and IAM can scope per path. */
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
      // Only a genuinely absent secret becomes null (owner must reconnect); swallowing other errors would tell every tenant their grant expired during a transient AWS problem.
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
        // Not `ForceDeleteWithoutRecovery`: a mistaken disconnect stays recoverable, and scheduled deletion still disables the secret immediately.
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
