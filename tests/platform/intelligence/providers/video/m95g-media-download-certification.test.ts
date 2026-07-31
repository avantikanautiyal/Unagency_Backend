/**
 * M9.5G — production media download + SSRF hardening certification.
 */

import { FetchMediaDownloadClient } from "../../../../../src/platform/media/ingestion/fetch-media-download-client";
import {
  validateIngestionUrl,
  validateIngestionUrlWithDns,
  validateRedirectUrl,
} from "../../../../../src/platform/media/ingestion/ssrf-guard";
import {
  createMediaDownloadClientForComposition,
} from "../../../../../src/platform/infrastructure/durability/create-async-media-platform";
import { FakeMediaDownloadClient } from "../../../../../src/platform/media/ingestion/media-ingestion-service";

describe("M9.5G media download composition", () => {
  it("uses FetchMediaDownloadClient for LIVE durable production composition", () => {
    const client = createMediaDownloadClientForComposition({
      durable: true,
      isProductionBacked: true,
      useRecordingBlobStorage: false,
    });
    expect(client).toBeInstanceOf(FetchMediaDownloadClient);
  });

  it("uses FakeMediaDownloadClient for tests and recording S3 doubles", () => {
    expect(
      createMediaDownloadClientForComposition({
        durable: true,
        isProductionBacked: true,
        useRecordingBlobStorage: true,
      })
    ).toBeInstanceOf(FakeMediaDownloadClient);
    expect(
      createMediaDownloadClientForComposition({
        durable: false,
        isProductionBacked: false,
        useRecordingBlobStorage: false,
      })
    ).toBeInstanceOf(FakeMediaDownloadClient);
  });
});

describe("M9.5G SSRF guard", () => {
  it("rejects private IPv4, localhost, metadata, and non-HTTPS in production mode", async () => {
    expect(validateIngestionUrl("http://127.0.0.1/v.mp4").ok).toBe(false);
    expect(validateIngestionUrl("http://localhost/v.mp4").ok).toBe(false);
    expect(validateIngestionUrl("http://10.0.0.1/v.mp4").ok).toBe(false);
    expect(validateIngestionUrl("http://169.254.169.254/meta").ok).toBe(false);
    expect(validateIngestionUrl("http://[::1]/v.mp4").ok).toBe(false);
    expect(
      validateIngestionUrl("http://cdn.example.test/v.mp4", { httpsOnly: true }).ok
    ).toBe(false);
    expect(
      validateIngestionUrl("https://cdn.example.test/v.mp4", { httpsOnly: true }).ok
    ).toBe(true);
  });

  it("rejects redirect to private target", () => {
    const r = validateRedirectUrl(
      "https://cdn.example.test/a.mp4",
      "http://127.0.0.1/b.mp4",
      { httpsOnly: true }
    );
    expect(r.ok).toBe(false);
  });

  it("resolves public DNS for hostname URLs", async () => {
    const r = await validateIngestionUrlWithDns("https://example.com/video.mp4", {
      httpsOnly: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe("M9.5G FetchMediaDownloadClient", () => {
  it("follows redirects with revalidation and enforces Content-Length", async () => {
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/redirect")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/final.mp4" },
        });
      }
      if (url.includes("/final.mp4")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "3" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = new FetchMediaDownloadClient({ fetchImpl });
    const result = await client.download("https://example.com/redirect", {
      maxBytes: 1024,
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(true);
    expect(calls.length).toBe(2);
  });

  it("rejects Content-Length above maxBytes before streaming", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-length": "999999999" },
        })
    ) as unknown as typeof fetch;

    const client = new FetchMediaDownloadClient({ fetchImpl });
    const result = await client.downloadStream("https://example.com/big.mp4", {
      maxBytes: 100,
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
  });

  it("aborts when streamed bytes exceed limit", async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(50));
              controller.enqueue(new Uint8Array(60));
              controller.close();
            },
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    const client = new FetchMediaDownloadClient({ fetchImpl });
    const result = await client.downloadStream("https://example.com/stream.mp4", {
      maxBytes: 100,
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(async () => {
      for await (const _ of result.value.stream) {
        /* drain */
      }
    }).rejects.toThrow(/maxBytes/);
  });
});
