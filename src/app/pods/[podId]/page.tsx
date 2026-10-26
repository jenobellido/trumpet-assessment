import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PodDetailsForm } from "@/features/pods/components/PodDetailsForm";
import { ShareBar } from "@/features/pods/components/ShareBar";
import { podIdSchema } from "@/features/pods/domain/pod";
import { WidgetBoard, WidgetBoardSkeleton } from "@/features/widgets";
import { getContainer } from "@/server/container";
import shell from "../../shell.module.css";

/**
 * Pod editor. The static shell (back link) is prerendered; the pod streams in
 * at request time with its widgets already in the HTML, so a refresh shows
 * saved content immediately instead of a spinner followed by a fetch.
 */
export default function PodEditorPage({ params }: PageProps<"/pods/[podId]">) {
  return (
    <main className={shell.page}>
      <nav>
        <Link href="/" className={shell.back}>
          ← All pods
        </Link>
      </nav>
      <Suspense fallback={<WidgetBoardSkeleton />}>
        <PodEditor params={params} />
      </Suspense>
    </main>
  );
}

async function PodEditor({ params }: Pick<PageProps<"/pods/[podId]">, "params">) {
  const { podId } = await params;
  if (!podIdSchema.safeParse(podId).success) notFound();

  const app = getContainer();
  const pod = await app.pods.find(podId);
  if (!pod) notFound();
  const [widgets, stats] = await Promise.all([app.widgets.list(podId), app.pods.getStats(podId)]);

  return (
    <>
      <header className={shell.editorTop}>
        <div>
          <p className={shell.eyebrow}>Pod</p>
          <PodDetailsForm pod={pod} />
        </div>
        <ShareBar shareId={pod.shareId} stats={stats} />
      </header>
      <WidgetBoard podId={pod.id} initialWidgets={widgets} />
    </>
  );
}
