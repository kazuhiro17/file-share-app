import FileDownloadClient from "./client";

export type FileInfo = {
  id: string;
  filename: string;
  filepath: string;
  contentType: string;
  expiresAt: string;
  createdAt: string;
};

async function getFileInfo(id: string) {
  const baseUrl = process.env.BASE_URL || "http://localhost:8787";
  const response = await fetch(`${baseUrl}/api/files/${id}`);
  return (await response.json()) as FileInfo | null;
}

export default async function Page(props: { params: { id: string } }) {
  const params = await props.params;
  const fileInfo = await getFileInfo(params.id);

  if (!fileInfo) {
    return <div>ファイルが見つかりませんでした。</div>;
  }

  const now = new Date();
  const expiresAt = new Date(fileInfo.expiresAt);
  const isExpired = expiresAt < now;

  if (isExpired) {
    return <div>ファイルの有効期限が切れました。</div>;
  }

  return <FileDownloadClient fileId={params.id} />;
}
