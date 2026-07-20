import Credential, { Config as CredentialConfig } from "@alicloud/credentials";

export interface AlibabaCredentialInput {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

export function createAlibabaCredential(
  credentials?: AlibabaCredentialInput
): Credential.default {
  if (!credentials?.accessKeyId || !credentials.accessKeySecret) {
    return new Credential.default();
  }

  return new Credential.default(
    new CredentialConfig({
      type: credentials.securityToken ? "sts" : "access_key",
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      ...(credentials.securityToken
        ? { securityToken: credentials.securityToken }
        : {})
    })
  );
}
