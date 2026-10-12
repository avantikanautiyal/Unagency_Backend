import express from "express";
import http from "http";
import { gunzipSync } from "zlib";
import { jsonCompression } from "../../../src/middlewares/jsonCompression.middleware";

function request(
  port: number,
  path: string,
  acceptEncoding?: string
): Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http
      .get(
        { port, path, headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        }
      )
      .on("error", reject);
  });
}

describe("jsonCompression", () => {
  const big = { items: Array.from({ length: 500 }, (_, i) => ({ id: i, label: "route card" })) };
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    app.use(jsonCompression);
    app.get("/big", (_req, res) => res.status(201).json(big));
    app.get("/small", (_req, res) => res.json({ ok: true }));
    app.get("/text", (_req, res) => res.send("x".repeat(5000)));
    server = app.listen(0, () => {
      port = (server.address() as { port: number }).port;
      done();
    });
  });
  afterAll((done) => {
    server.close(() => done());
  });

  test("gzips a large JSON body and keeps it identical", async () => {
    const res = await request(port, "/big", "gzip, br");
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.parse(gunzipSync(res.body).toString())).toEqual(big);
    expect(res.body.length).toBeLessThan(JSON.stringify(big).length / 3);
  });

  test("leaves small bodies, non-JSON bodies and clients without gzip alone", async () => {
    expect((await request(port, "/small", "gzip")).headers["content-encoding"]).toBeUndefined();
    expect((await request(port, "/text", "gzip")).headers["content-encoding"]).toBeUndefined();
    const plain = await request(port, "/big");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(JSON.parse(plain.body.toString())).toEqual(big);
  });
});
