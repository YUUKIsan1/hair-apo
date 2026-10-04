import ApplyForm from "./ApplyForm";

export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-xl font-bold">サロン導入のお申し込み</h1>
      <p className="mt-3 text-sm leading-6 text-mute">
        ご入力いただいた内容を運営が確認し、承認後にログイン情報をお送りします。
      </p>
      <div className="mt-6">
        <ApplyForm />
      </div>
    </main>
  );
}
