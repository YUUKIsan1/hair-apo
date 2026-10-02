export default async function SalonPage({
  params,
}: {
  params: Promise<{ salonSlug: string }>;
}) {
  const { salonSlug } = await params;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">店舗ページ ({salonSlug})</h1>
      <p className="mt-4 text-gray-600">
        サロン情報・スタッフ・メニュー一覧・予約導線をここに実装します。
      </p>
    </main>
  );
}
