import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
