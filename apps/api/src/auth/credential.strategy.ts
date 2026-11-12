import type { SubjectRef } from "./sessions.queries.js";

// Credentials per login method. Adding a method (Google, passkey...) means
// augmenting this interface, writing one @Injectable() strategy and listing it
// in AuthModule: no existing strategy changes.
export interface CredentialInputs {
  password: PasswordCredential;
  admin_passcode: PasscodeCredential;
}

export type CredentialMethod = keyof CredentialInputs;

// Trainees sign in by email, admins by username (the web does the same).
export type PasswordCredential =
  | { subject: "user"; email: string; password: string }
  | { subject: "admin"; username: string; password: string };

// Second factor for an admin that is already signed in.
export type PasscodeCredential = { adminId: number; passcode: string };

export interface CredentialStrategy<
  M extends CredentialMethod = CredentialMethod,
> {
  readonly method: M;
  // Resolves to who the credential proves. Throws InvalidCredentialsError,
  // LoginLockedError or a passcode error; never returns on a failure.
  verify(input: CredentialInputs[M]): Promise<SubjectRef>;
}

// Injection token for every registered strategy (a multi-provider list).
export const CREDENTIAL_STRATEGIES = Symbol("CREDENTIAL_STRATEGIES");

// The context object: picks the strategy by method.
export class CredentialStrategies {
  private readonly byMethod = new Map<CredentialMethod, CredentialStrategy>();

  constructor(strategies: CredentialStrategy[]) {
    for (const strategy of strategies) {
      this.byMethod.set(strategy.method, strategy);
    }
  }

  get<M extends CredentialMethod>(method: M): CredentialStrategy<M> {
    const strategy = this.byMethod.get(method);

    if (!strategy) {
      throw new Error(`No credential strategy registered for "${method}"`);
    }
    return strategy as unknown as CredentialStrategy<M>;
  }
}
