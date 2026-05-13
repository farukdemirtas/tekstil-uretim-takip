/**
 * html2canvas klonunda html.dark kaldırılır; ayrıca beyaz PDF zemininde koyu tema metinlerinin görünürlüğü için yedek kurallar enjekte edilir.
 */
export function injectPdfCloneLightTextFix(clonedDoc: Document): void {
  clonedDoc.documentElement.classList.remove("dark");
  clonedDoc.body?.classList.remove("dark");

  const id = "pdf-html2canvas-force-light-text";
  if (clonedDoc.getElementById(id)) return;
  const style = clonedDoc.createElement("style");
  style.id = id;
  style.textContent = `
    [data-pdf-render-root],
    [data-pdf-render-root] * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html.dark [data-pdf-render-root] {
      color: #0f172a !important;
      -webkit-text-fill-color: #0f172a !important;
    }

    html.dark .person-pdf-print-host,
    html.dark .bulk-pdf-print-host {
      color-scheme: light !important;
      background-color: #ffffff !important;
      color: #0f172a !important;
    }

    html.dark .person-pdf-print-host .text-slate-900,
    html.dark .bulk-pdf-print-host .text-slate-900,
    html.dark [data-pdf-render-root] .text-slate-900 {
      color: #0f172a !important;
      -webkit-text-fill-color: #0f172a !important;
    }
    html.dark .person-pdf-print-host .text-slate-800,
    html.dark .bulk-pdf-print-host .text-slate-800,
    html.dark [data-pdf-render-root] .text-slate-800 {
      color: #1e293b !important;
      -webkit-text-fill-color: #1e293b !important;
    }
    html.dark .person-pdf-print-host .text-slate-700,
    html.dark .bulk-pdf-print-host .text-slate-700,
    html.dark [data-pdf-render-root] .text-slate-700 {
      color: #334155 !important;
      -webkit-text-fill-color: #334155 !important;
    }
    html.dark .person-pdf-print-host .text-slate-600,
    html.dark .bulk-pdf-print-host .text-slate-600,
    html.dark [data-pdf-render-root] .text-slate-600 {
      color: #475569 !important;
      -webkit-text-fill-color: #475569 !important;
    }
    html.dark .person-pdf-print-host .text-slate-500,
    html.dark .bulk-pdf-print-host .text-slate-500,
    html.dark [data-pdf-render-root] .text-slate-500 {
      color: #64748b !important;
      -webkit-text-fill-color: #64748b !important;
    }
    html.dark .person-pdf-print-host .text-slate-400,
    html.dark .bulk-pdf-print-host .text-slate-400,
    html.dark [data-pdf-render-root] .text-slate-400 {
      color: #94a3b8 !important;
      -webkit-text-fill-color: #94a3b8 !important;
    }

    html.dark .person-pdf-print-host .text-teal-600,
    html.dark .bulk-pdf-print-host .text-teal-600,
    html.dark [data-pdf-render-root] .text-teal-600 { color: #0d9488 !important; -webkit-text-fill-color: #0d9488 !important; }
    html.dark .person-pdf-print-host .text-teal-700,
    html.dark .bulk-pdf-print-host .text-teal-700,
    html.dark [data-pdf-render-root] .text-teal-700 { color: #0f766e !important; -webkit-text-fill-color: #0f766e !important; }
    html.dark .person-pdf-print-host .text-teal-800,
    html.dark .bulk-pdf-print-host .text-teal-800,
    html.dark [data-pdf-render-root] .text-teal-800 { color: #115e59 !important; -webkit-text-fill-color: #115e59 !important; }

    html.dark .person-pdf-print-host .text-blue-700,
    html.dark .bulk-pdf-print-host .text-blue-700,
    html.dark [data-pdf-render-root] .text-blue-700 { color: #1d4ed8 !important; -webkit-text-fill-color: #1d4ed8 !important; }
    html.dark .person-pdf-print-host .text-violet-700,
    html.dark .bulk-pdf-print-host .text-violet-700,
    html.dark [data-pdf-render-root] .text-violet-700 { color: #6d28d9 !important; -webkit-text-fill-color: #6d28d9 !important; }
    html.dark .person-pdf-print-host .text-violet-800,
    html.dark .bulk-pdf-print-host .text-violet-800,
    html.dark [data-pdf-render-root] .text-violet-800 { color: #5b21b6 !important; -webkit-text-fill-color: #5b21b6 !important; }
    html.dark .person-pdf-print-host .text-amber-800,
    html.dark .bulk-pdf-print-host .text-amber-800,
    html.dark [data-pdf-render-root] .text-amber-800 { color: #92400e !important; -webkit-text-fill-color: #92400e !important; }
    html.dark .person-pdf-print-host .text-emerald-700,
    html.dark .bulk-pdf-print-host .text-emerald-700,
    html.dark [data-pdf-render-root] .text-emerald-700 { color: #047857 !important; -webkit-text-fill-color: #047857 !important; }
    html.dark .person-pdf-print-host .text-amber-700,
    html.dark .bulk-pdf-print-host .text-amber-700,
    html.dark [data-pdf-render-root] .text-amber-700 { color: #b45309 !important; -webkit-text-fill-color: #b45309 !important; }
  `;

  const head = clonedDoc.head;
  if (head) {
    head.appendChild(style);
  } else {
    clonedDoc.documentElement.insertBefore(style, clonedDoc.documentElement.firstChild);
  }
}
