export default function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label block">{label}</span>
      {children}
    </label>
  );
}
