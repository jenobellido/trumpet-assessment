import Link from "next/link";
import shell from "./shell.module.css";

export default function NotFound() {
  return (
    <main className={shell.page} style={{ textAlign: "center" }}>
      <h1 className={shell.title}>Page not found</h1>
      <p className={shell.subtitle}>This pod or link doesn&apos;t exist, or it has been deleted.</p>
      <p>
        <Link href="/">Go to your pods</Link>
      </p>
    </main>
  );
}
