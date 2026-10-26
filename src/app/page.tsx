import { connection } from "next/server";
import { Suspense } from "react";
import { NewPodButton } from "@/features/pods/components/NewPodButton";
import { PodList } from "@/features/pods/components/PodList";
import { getContainer } from "@/server/container";
import shell from "./shell.module.css";

/** Pods dashboard: the seller's inventory of digital sales rooms. */
export default function DashboardPage() {
  return (
    <main className={shell.page}>
      <header className={shell.header}>
        <div>
          <p className={shell.eyebrow}>Digital sales rooms</p>
          <h1 className={shell.title}>Your pods</h1>
          <p className={shell.subtitle}>
            One pod per buyer. Build it from widgets, then share a single link.
          </p>
        </div>
        <div className={shell.headerActions}>
          <NewPodButton />
        </div>
      </header>
      <Suspense fallback={<div className={shell.skeleton} aria-label="Loading pods" />}>
        <Pods />
      </Suspense>
    </main>
  );
}

async function Pods() {
  await connection(); // fresh on every request
  return <PodList pods={await getContainer().pods.list()} />;
}
