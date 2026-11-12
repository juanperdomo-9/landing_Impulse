import { redirect } from "next/navigation";

/** Old address of the editor (/editor/editor): it now lives at the root of the app (/editor). Keeps ?p=<project>. */
export default async function OldEditorPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  redirect(p && /^[0-9a-f-]{36}$/i.test(p) ? `/?p=${p}` : "/");
}
