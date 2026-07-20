import Link from "next/link";
import { Button } from "./common";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-4">
      Hey, {user.email}!
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Link href="/auth/login">
        <Button size="small">Sign in</Button>
      </Link>
      <Link href="/auth/sign-up">
        <Button size="small" type="primary">
          Sign up
        </Button>
      </Link>
    </div>
  );
}
