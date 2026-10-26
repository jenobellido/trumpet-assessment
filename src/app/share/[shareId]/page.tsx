import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ViewBeacon } from "@/features/pods/components/ViewBeacon";
import { podDisplayTitle, shareIdSchema } from "@/features/pods/domain/pod";
import { PodContent } from "@/features/widgets";
import { getContainer } from "@/server/container";
import shell from "../../shell.module.css";

// Buyer links are private: keep them out of search engines and referrers.
export const metadata: Metadata = {
  title: "Pod",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** What the buyer sees: content only, server-rendered, no editing controls. */
export default function BuyerPodPage({ params }: PageProps<"/share/[shareId]">) {
  return (
    <main className={shell.buyerPage}>
      <Suspense fallback={<div className={shell.skeleton} aria-label="Loading" />}>
        <BuyerPod params={params} />
      </Suspense>
    </main>
  );
}

async function BuyerPod({ params }: Pick<PageProps<"/share/[shareId]">, "params">) {
  const { shareId } = await params;
  if (!shareIdSchema.safeParse(shareId).success) notFound();

  const app = getContainer();
  const pod = await app.pods.getByShareId(shareId);
  if (!pod) notFound();
  const widgets = await app.widgets.list(pod.id);

  return (
    <article>
      <ViewBeacon shareId={shareId} />
      <header className={shell.buyerHeader}>
        {pod.buyerName && <p className={shell.eyebrow}>Prepared for {pod.buyerName}</p>}
        <h1 className={shell.buyerTitle}>{podDisplayTitle(pod)}</h1>
      </header>
      <PodContent widgets={widgets} emptyMessage="This pod is still being prepared." />
    </article>
  );
}
