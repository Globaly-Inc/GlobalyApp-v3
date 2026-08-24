"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canvas PDF viewer — a port of GlobalyOS V2's `components/feed/PDFViewer`: one page
 * rendered to a canvas scaled to the container, with V2's bottom bar underneath (prev,
 * page slider, next, `N / M`, and a download in lightbox mode).
 *
 * REQUIRES `pdfjs-dist`, and the worker served from /public:
 *
 *   npm install pdfjs-dist
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs frontend/public/
 *
 * V2 points the worker at `//unpkg.com/pdfjs-dist@<version>/build/pdf.worker.min.mjs`.
 * That is not reproduced: a runtime CDN fetch means the viewer breaks offline, leaks the
 * fact that a document was opened to a third party, and silently mismatches if the
 * installed version drifts from the pinned URL. Serving the worker from our own origin
 * costs one copy step and none of that.
 *
 * pdf.js is imported dynamically so the ~400KB of it stays out of the initial chat
 * bundle — nothing loads until a PDF actually appears in a conversation.
 */

/** The slice of pdf.js this component touches. Declared locally so the module's own
 *  types are not needed at build time by anything other than this file. */
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };

let workerConfigured = false;

/** Loads pdf.js once and pins its worker to our own origin. */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerConfigured = true;
  }
  return pdfjs;
}

export function PdfViewer({
  fileUrl,
  fileName,
  mode,
  onExpand,
}: Readonly<{
  /**
   * A freshly signed, expiring URL. It changes identity on every poll of the thread, so
   * it must NOT be an effect dependency — the caller keys this component by the file's
   * stable storage path instead, and the loader reads the URL through a ref.
   */
  fileUrl: string;
  fileName: string;
  /** `inline` fits to width and flows its height; `lightbox` also caps at 80vh. */
  mode: "inline" | "lightbox";
  /** Renders V2's expand control; omitted in the lightbox, which is already expanded. */
  onExpand?: () => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // Kept so a failure is diagnosable in the UI. A flat "couldn't render" sent us hunting
  // through the pdf.js API for what turned out to be a missing bucket CORS policy.
  const [failure, setFailure] = useState<string | null>(null);

  // Captured once at mount, not tracked: the loader below needs a URL exactly once, and
  // depending on the prop would reload the document every time the thread's poll re-signs
  // it. The component is remounted (keyed by storage path) when the FILE changes.
  const urlRef = useRef(fileUrl);

  // Mount-only: the caller remounts this component (keyed by storage path) when the
  // file itself changes, which is what makes "load once" correct and keeps the reset of
  // page/state out of an effect entirely.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // The two failure modes are separated because they have different fixes: the
      // library/worker not being served is a build problem, the document fetch failing
      // is almost always a CORS policy problem on the bucket.
      let pdfjs: Awaited<ReturnType<typeof loadPdfjs>>;
      try {
        pdfjs = await loadPdfjs();
      } catch (err) {
        if (cancelled) return;
        setFailure(`pdf.js failed to load — is pdf.worker.min.mjs in /public? (${String(err)})`);
        setState("failed");
        return;
      }

      try {
        // disableRange/disableStream: chat PDFs are small (tens of KB), so one plain GET
        // beats byte-range chunking — and it keeps the request a simple cross-origin GET
        // instead of one needing `Range` allowed through CORS preflight.
        const doc = (await pdfjs.getDocument({
          url: urlRef.current,
          disableRange: true,
          disableStream: true,
        }).promise) as unknown as PdfDocument;
        if (cancelled) return;
        docRef.current = doc;
        setTotalPages(doc.numPages);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setFailure(
          message === "Failed to fetch"
            ? "Failed to fetch the file. The storage bucket is missing a CORS policy for this origin — see devops/gcs-cors.json."
            : message,
        );
        setState("failed");
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, []);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container) return;

      // A pending render for the previous page would otherwise draw over this one.
      renderTaskRef.current?.cancel();

      try {
        const pdfPage = await doc.getPage(pageNumber);
        const context = canvas.getContext("2d");
        if (!context) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const fitWidth = container.clientWidth / base.width;
        // Lightbox also has to fit the window's height; inline just flows.
        const scale =
          (mode === "lightbox" ? Math.min(fitWidth, (window.innerHeight * 0.8) / base.height) : fitWidth) * dpr;

        const viewport = pdfPage.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // The backing store is DPR-scaled; the CSS box is not, which is what keeps the
        // render crisp on a retina display.
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const task = pdfPage.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch {
        // A cancelled render is the normal case when paging quickly — not an error.
      }
    },
    [mode],
  );

  useEffect(() => {
    if (state === "ready") void renderPage(page);
  }, [state, page, renderPage]);

  // Re-fit on resize: the scale is derived from the container's width.
  useEffect(() => {
    if (state !== "ready") return;
    const observer = new ResizeObserver(() => void renderPage(page));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [state, page, renderPage]);

  if (state === "failed") {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t render this PDF.</p>
        {failure && <p className="max-w-sm break-words text-xs text-muted-foreground/70">{failure}</p>}
        <a
          href={fileUrl}
          download={fileName}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Download className="size-3.5" aria-hidden />
          Download it instead
        </a>
      </div>
    );
  }

  return (
    <div className="group/pdf flex w-full flex-col">
      <div ref={containerRef} className="relative flex w-full justify-center bg-muted/30">
        {state === "loading" && (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
        <canvas ref={canvasRef} className={cn("max-w-full", state === "loading" && "hidden")} />

        {onExpand && state === "ready" && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={`Expand ${fileName}`}
            title="Expand"
            className="absolute right-1.5 top-1.5 flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background shadow-sm opacity-0 transition-opacity group-hover/pdf:opacity-100 focus-visible:opacity-100"
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* V2's page bar: prev, slider, next, counter — plus download in the lightbox. */}
      {state === "ready" && totalPages > 0 && (
        <div className="flex items-center gap-2 border-t border-border bg-card px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>

          <input
            type="range"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            aria-label={`Page ${page} of ${totalPages}`}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
          />

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>

          {mode === "lightbox" && (
            <a
              href={fileUrl}
              download={fileName}
              aria-label={`Download ${fileName}`}
              title="Download"
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
