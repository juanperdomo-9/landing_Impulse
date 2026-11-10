import { redirect } from "next/navigation";

/** Old address of the editor (/editor/editor): it now lives at the root of the app (/editor). */
export default function OldEditorPage() {
  redirect("/");
}
