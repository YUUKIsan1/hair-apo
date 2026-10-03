import SettingsNav from "./SettingsNav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">店舗設定</h1>
      <div className="mt-4 border-b hairline">
        <SettingsNav />
      </div>
      <div className="mt-6 max-w-3xl">{children}</div>
    </div>
  );
}
