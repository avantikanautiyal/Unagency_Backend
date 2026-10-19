import { SeedanceVideoProtocol } from "../../../../src/platform/providers/video/seedance/seedance-video-protocol";
import { BlobAccessService } from "../../../../src/platform/media/blob/blob-access-service";
import { BlobOwnershipRegistry } from "../../../../src/platform/media/blob/blob-ownership-registry";
import { RecordingS3BlobStorage } from "../../../../src/platform/persistence/storage/s3-blob-storage";

function request(payload: Record<string, unknown>) {
  return {
    capabilityId: "video.generate",
    providerId: "provider.seedance",
    modelId: "seedance/seedance-2",
    payload,
    context: { organizationId: "org_test", executionId: "exec_test" },
  } as never;
}

describe("seedance-video-protocol (seedanceapi.org v2)", () => {
  const protocol = new SeedanceVideoProtocol();

  it("builds a v2 generate request with the opening frame only", () => {
    const plan = protocol.buildSubmit(
      request({ prompt: "Shot 1 of 3", aspectRatio: "1:1", duration: 7 }),
      protocol.resolveWireModel("seedance/seedance-2")!,
      ["data:image/png;base64,AAAA", "https://cdn.example.com/panel-0.png", "https://cdn.example.com/logo.png"],
      "idem",
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.path).toBe("/v2/generate");
    expect(plan.value.body).toEqual({
      prompt: "Shot 1 of 3",
      model: "seedance-2.0",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "3:4",
      images: ["https://cdn.example.com/panel-0.png"],
    });
  });

  it("parses task_id, polls by query and reads data.response[0]", () => {
    const submit = protocol.parseSubmit({ code: 200, data: { task_id: "t_1", status: "IN_PROGRESS" } });
    expect(submit.ok && submit.value.providerJobId).toBe("t_1");
    const poll = protocol.buildPoll("t_1");
    expect(poll.ok && poll.value.path).toBe("/v2/status?task_id=t_1");
    const done = protocol.parsePoll({ data: { status: "SUCCESS", response: ["https://cdn.example.com/v.mp4"] } });
    expect(done.ok && done.value.status).toBe("completed");
    const failed = protocol.parsePoll({ data: { status: "FAILED", error_message: "bad prompt" } });
    expect(failed.ok && failed.value.status === "failed" && failed.value.errorMessage).toBe("bad prompt");
  });
});

describe("BlobAccessService.stageInlineProviderInput", () => {
  it("stores a data URL under the tenant prefix and returns a signed URL", async () => {
    const storage = new RecordingS3BlobStorage();
    const access = new BlobAccessService(new BlobOwnershipRegistry(), storage as never);
    const staged = await access.stageInlineProviderInput({
      dataUrl: `data:image/png;base64,${Buffer.from("panel").toString("base64")}`,
      organizationId: "org_test",
      keyPrefix: "executions/exec_test/provider-inputs",
    });
    expect(staged.ok).toBe(true);
    const keys = [...storage.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^tenant\/org_test\/executions\/exec_test\/provider-inputs\/[0-9a-f]+\.png$/);
    expect(storage.objects.get(keys[0]!)?.data.toString()).toBe("panel");
  });
});
