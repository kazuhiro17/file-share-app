import { files } from "../../../../db/schema";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const app = new Hono().basePath("/api");

app.get("/files", async (c) => {
  const db = drizzle(
    (getCloudflareContext().env as any).DB as unknown as D1Database
  );
  const fileResponse = await db.select().from(files);
  return c.json(fileResponse);
});

app.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const fileData = formData.get("file");
  const expirationDays = formData.get("expiration");

  if (!fileData) {
    return c.json({ success: false, message: "ファイルがありません。" }, 400);
  }
  const file = fileData as File;
  const fileName = file.name;
  const filePath = `upload/${Date.now()}-${fileName}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(expirationDays));

  try {
    const r2 = (getCloudflareContext().env as any).R2 as unknown as R2Bucket;
    await r2.put(filePath, file);
  } catch (r2Error) {
    return c.json(
      { success: false, message: `File upload failed: ${r2Error}` },
      500
    );
  }

  const db = drizzle(
    (getCloudflareContext().env as any).DB as unknown as D1Database
  );

  try {
    await db.insert(files).values({
      filename: fileName,
      filepath: filePath,
      contentType: file.type,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return c.json(
      { success: false, message: "ファイルの保存に失敗しました。" },
      500
    );
  }
  const insertRecord = await db
    .select()
    .from(files)
    .orderBy(desc(files.createdAt))
    .limit(1);
  
  // リクエストから動的にベースURLを取得
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  
  return c.json({
    success: true,
    message: "ファイルを保存しました。",
    url: `${baseUrl}/files/${insertRecord[0].id}`,
    expiresAt: expiresAt.toISOString(),
  });
});

app.get("/files/:id", async (c) => {
  const id = c.req.param("id");
  const db = drizzle(
    (getCloudflareContext().env as any).DB as unknown as D1Database
  );
  const file = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (file.length === 0) {
    return c.json({ error: "ファイルが見つかりませんでした。" }, 404);
  }
  return c.json(file[0]);
});

app.get("/download/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = drizzle(
      (getCloudflareContext().env as any).DB as unknown as D1Database
    );
    const fileResult = await db.select().from(files).where(eq(files.id, id)).limit(1);

    if (fileResult.length === 0) {
      return c.json({ error: "ファイルが見つかりませんでした。" }, 404);
    }

    const fileInfo = fileResult[0];

    if (new Date() > new Date(fileInfo.expiresAt)) {
      return c.json({ error: "ファイルの有効期限が切れました。" }, 403);
    }

    const r2 = (getCloudflareContext().env as any).R2 as unknown as R2Bucket;
    const file = await r2.get(fileInfo.filepath);

    if (!file) {
      return c.json({ error: "ストレージにファイルが見つかりませんでした。" }, 404);
    }

    const arrayBuffer = await file.arrayBuffer();
    c.header(
      "Content-Disposition",
      `attachment; filename=${fileInfo.filename}`
    );
    c.header("Content-Type", fileInfo.contentType || "application/octet-stream");
    c.header("Content-Length", String(arrayBuffer.byteLength));

    return c.body(arrayBuffer);
  } catch (error) {
    return c.json({ error: "ファイルダウンロード中にエラーが発生しました" }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);
