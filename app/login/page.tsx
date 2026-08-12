import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <form className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">KickPlanner</h1>

        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
        )}

        <input
          name="email"
          type="email"
          placeholder="tu@email.com"
          required
          className="rounded border p-2 text-gray-900"
        />
        <input
          name="password"
          type="password"
          placeholder="Contrasena"
          required
          className="rounded border p-2 text-gray-900"
        />

        <button
          formAction={login}
          className="rounded bg-blue-600 p-2 font-medium text-white hover:bg-blue-700"
        >
          Ingresar
        </button>
        <button
          formAction={signup}
          className="rounded border border-blue-600 p-2 font-medium text-blue-600 hover:bg-blue-50"
        >
          Crear cuenta
        </button>
      </form>
    </main>
  );
}
