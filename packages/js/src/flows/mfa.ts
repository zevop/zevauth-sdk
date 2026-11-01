import type { Http } from '../internal/http.js';
import { ZevAuthError } from '../types.js';

/** A second factor the person has set up. */
export interface MfaFactor {
  id: string;
  /** `totp` (an authenticator app) today. */
  type: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MfaStatus {
  /** The app's policy: `off`, `optional` or `required`. */
  policy: 'off' | 'optional' | 'required';
  /** Factor types this app lets people set up. */
  allowedFactors: string[];
  factors: MfaFactor[];
  recoveryCodesRemaining: number;
}

export interface TotpEnrollment {
  factorId: string;
  /** Base32, for typing in by hand. Shown once; never readable again. */
  secret: string;
  /** `otpauth://…`, for a QR code. */
  otpauthUri: string;
}

/**
 * The signed-in person's own two-step verification: set it up, remove
 * it, and manage recovery codes.
 *
 * Usable while the session has a pending `setup_mfa` task, which is how
 * an app that requires MFA gets people through it. After `confirmTotp`
 * the client refreshes its session so the task clears at once.
 */
export class MfaFlow {
  constructor(
    private readonly http: Http,
    private readonly getToken: () => Promise<string | null>,
    /** Re-mints the session after enrollment, so a `setup_mfa` task clears. */
    private readonly refreshSession: () => Promise<void>,
  ) {}

  async status(): Promise<MfaStatus> {
    return this.http.get<MfaStatus>('/v1/me/mfa', { accessToken: await this.token() });
  }

  /** Starts setting up an authenticator app. Show `otpauthUri` as a QR code. */
  async startTotp(): Promise<TotpEnrollment> {
    return this.http.post<TotpEnrollment>('/v1/me/mfa/totp', undefined, {
      accessToken: await this.token(),
    });
  }

  /**
   * Finishes setting up the app with its first code. Returns the
   * recovery codes, which are shown once: ask the person to save them.
   */
  async confirmTotp(params: { code: string }): Promise<{ factor: MfaFactor; recoveryCodes: string[] }> {
    const result = await this.http.post<{ factor: MfaFactor; recoveryCodes: string[] }>(
      '/v1/me/mfa/totp/confirm',
      { code: params.code },
      { accessToken: await this.token() },
    );
    await this.refreshSession();
    return result;
  }

  /** Removes a factor. Needs a current code from it, or a recovery code. */
  async removeFactor(params: { factorId: string; code: string }): Promise<void> {
    await this.http.post(
      `/v1/me/mfa/factors/${encodeURIComponent(params.factorId)}/remove`,
      { code: params.code },
      { accessToken: await this.token() },
    );
    await this.refreshSession();
  }

  /** Replaces the recovery codes. Needs a current code. Shown once. */
  async regenerateRecoveryCodes(params: { code: string }): Promise<{ recoveryCodes: string[] }> {
    return this.http.post('/v1/me/mfa/recovery-codes', { code: params.code }, {
      accessToken: await this.token(),
    });
  }

  private async token(): Promise<string> {
    const accessToken = await this.getToken();
    if (!accessToken) throw new ZevAuthError('Nobody is signed in.', 'not_authenticated', 401);
    return accessToken;
  }
}
