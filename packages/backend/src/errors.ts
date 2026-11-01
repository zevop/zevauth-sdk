/** Everything this client throws. */
export class ZevAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /**
     * The request id ZevAuth logged this under, when the response
     * carried one (`x-request-id`). Quote it to ZevAuth support.
     */
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ZevAuthError';
  }
}
