import { connection } from "next/server";
import { redirect } from "next/navigation";
import Editor from "@/components/Editor";
import { daysLeft, getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";

export const metadata = { title: "Editor — Impulsa Studio" };

export default async function EditorPage() {
  await connection();
  if (!accountsEnabled()) return <Editor />;
  const account = await getAccount();
  if (!account) redirect("/login?next=/editor");
  if (!account.active) redirect("/cuenta");
  return (
    <Editor
      account={{
        email: account.email,
        used: account.used,
        limit: account.limit,
        trialDaysLeft: account.onTrial ? daysLeft(account.trialEndsAt) : null,
      }}
    />
  );
}
