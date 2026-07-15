import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";
import { recordProviderAdapterRequest } from "./provider-adapter.contract.ts";

export class CreatorDevProviderAdapter implements ProviderAdapter {
  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const {
      providerName: _providerName,
      recordRedactedRequest: _recordRedactedRequest,
      ...requestBody
    } = input;
    await recordProviderAdapterRequest(input, requestBody);
    return {
      externalRequestId: `external-${input.providerRequestId}`,
      status: "accepted",
      redactedResponse: {
        accepted: true,
        providerOperation: input.providerOperation,
        requestKey: input.requestKey,
      },
    };
  }
}

export function createCreatorDevProviderAdapter(): ProviderAdapter {
  return new CreatorDevProviderAdapter();
}
