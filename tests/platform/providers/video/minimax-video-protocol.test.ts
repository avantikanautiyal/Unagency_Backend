import { MinimaxVideoProtocol } from "../../../../src/platform/providers/video/minimax/minimax-video-protocol";

describe("minimax-video-protocol poll Fail", () => {
  const protocol = new MinimaxVideoProtocol();

  it("surfaces base_resp sensitive moderation instead of a generic Fail", () => {
    const parsed = protocol.parsePoll({
      task_id: "446040794550625",
      status: "Fail",
      file_id: "",
      base_resp: { status_code: 1027, status_msg: "output new_sensitive" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.status).toBe("failed");
    expect(parsed.value.errorCode).toBe("provider_content_filtered");
    expect(parsed.value.errorMessage).toContain("1027");
    expect(parsed.value.errorMessage).toContain("output new_sensitive");
  });
});
