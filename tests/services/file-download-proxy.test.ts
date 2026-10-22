import {
  attachmentDisposition,
  downloadFileName,
  isAllowedDownloadUrl,
  openProxiedDownload,
} from "../../src/services/file-download-proxy";

const env = { ENTERPRISE_BLOB_BUCKET: "prakriadirect" } as NodeJS.ProcessEnv;

describe("isAllowedDownloadUrl", () => {
  it("allows our bucket in virtual-hosted and path style", () => {
    expect(isAllowedDownloadUrl("https://prakriadirect.s3.ap-south-1.amazonaws.com/a/b.pdf", env)).toBe(true);
    expect(isAllowedDownloadUrl("https://prakriadirect.s3.amazonaws.com/a.png?X-Amz-Signature=1", env)).toBe(true);
    expect(isAllowedDownloadUrl("https://s3.ap-south-1.amazonaws.com/prakriadirect/a.zip", env)).toBe(true);
  });

  it("rejects other hosts, other buckets and non-https", () => {
    for (const url of [
      "http://prakriadirect.s3.ap-south-1.amazonaws.com/a.pdf",
      "https://otherbucket.s3.ap-south-1.amazonaws.com/a.pdf",
      "https://prakriadirect-evil.s3.amazonaws.com/a.pdf",
      "https://prakriadirect.s3.amazonaws.com.evil.com/a.pdf",
      "https://s3.amazonaws.com/otherbucket/prakriadirect/a.pdf",
      "https://169.254.169.254/latest/meta-data",
      "https://user:pw@prakriadirect.s3.amazonaws.com/a.pdf",
      "not a url",
    ]) {
      expect(isAllowedDownloadUrl(url, env)).toBe(false);
    }
  });
});

describe("downloadFileName", () => {
  it("strips characters Windows rejects and adds the extension", () => {
    expect(downloadFileName({ requested: 'Divastra: "Final" Emailer.', url: "https://x/y", contentType: "text/html; charset=utf-8" })).toBe(
      "Divastra_ _Final_ Emailer.html",
    );
  });

  it("falls back to the URL's last segment", () => {
    expect(downloadFileName({ url: "https://x/a/report%20v2.pdf", contentType: "application/pdf" })).toBe("report v2.pdf");
  });
});

describe("attachmentDisposition", () => {
  it("carries an ASCII fallback and the UTF-8 name", () => {
    expect(attachmentDisposition("Café · Deck.pdf")).toBe(
      `attachment; filename="Caf_ _ Deck.pdf"; filename*=UTF-8''Caf%C3%A9%20%C2%B7%20Deck.pdf`,
    );
  });
});

describe("openProxiedDownload", () => {
  const url = "https://prakriadirect.s3.ap-south-1.amazonaws.com/exports/abc.pdf";

  it("streams the file with the upstream name when none is requested", async () => {
    const fetchImpl = (async () =>
      new Response("pdf-bytes", {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Brand Deck.pdf"',
        },
      })) as unknown as typeof fetch;
    const file = await openProxiedDownload({ url, fetchImpl });
    expect(file.fileName).toBe("Brand Deck.pdf");
    expect(file.contentType).toBe("application/pdf");
    expect(await new Response(file.body).text()).toBe("pdf-bytes");
  });

  it("reports an expired link as 410 and refuses foreign hosts", async () => {
    const fetchImpl = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(openProxiedDownload({ url, fetchImpl })).rejects.toMatchObject({ status: 410 });
    await expect(openProxiedDownload({ url: "https://example.com/a.pdf", fetchImpl })).rejects.toMatchObject({ status: 400 });
  });
});
