import LoginForm from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-bold">
          サロン管理ログイン
        </h1>
        <div className="mt-8 rounded-lg border hairline bg-card p-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-mute">
          ログイン情報はサロン契約時に発行されます
        </p>
      </div>
    </main>
  );
}
