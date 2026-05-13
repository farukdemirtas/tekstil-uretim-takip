/**
 * html2pdf.js kaynak öğeyi opacity:0 overlay içinde klonlayıp html2canvas uygular;
 * bazı ortamlarda sonuç tamamen beyaz sayfa oluyor. Bu yol doğrudan html2canvas + jsPDF kullanır.
 */
export async function downloadElementAsMultiPagePdf(params: {
  element: HTMLElement;
  fileName: string;
  marginMm?: number;
  scale?: number;
  imageQuality?: number;
  onclone?: (doc: Document) => void;
}): Promise<void> {
  const {
    element,
    fileName,
    marginMm = 10,
    scale = 2,
    imageQuality = 0.92,
    onclone,
  } = params;

  const html2canvas = (await import("html2canvas")).default;
  const jsPDF = (await import("jspdf")).default;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone,
  });

  if (canvas.width < 2 || canvas.height < 2) {
    throw new Error("PDF için geçerli görüntü oluşmadı");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * marginMm;
  const contentHeight = pageHeight - 2 * marginMm;

  const imgWidthMm = contentWidth;
  const imgHeightMm = (canvas.height * contentWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", imageQuality);

  let pageIndex = 0;
  let heightLeft = imgHeightMm;

  while (true) {
    if (pageIndex > 0) pdf.addPage();
    const y = marginMm - pageIndex * contentHeight;
    pdf.addImage(imgData, "JPEG", marginMm, y, imgWidthMm, imgHeightMm);
    pageIndex += 1;
    heightLeft -= contentHeight;
    if (heightLeft <= 0) break;
  }

  pdf.save(fileName);
}

/** Her kök öğe ayrı yakalanır; görüntü tek A4’e sığdırılır, sol üst (margin) köşeden hizalanır (personel başına bir sayfa). */
export async function downloadEachElementAsOwnPdfPage(params: {
  elements: HTMLElement[];
  fileName: string;
  marginMm?: number;
  scale?: number;
  imageQuality?: number;
  onclone?: (doc: Document) => void;
}): Promise<void> {
  const {
    elements,
    fileName,
    marginMm = 6,
    scale = 2,
    imageQuality = 0.92,
    onclone,
  } = params;

  if (elements.length === 0) {
    throw new Error("PDF için personel kutusu bulunamadı");
  }

  const html2canvas = (await import("html2canvas")).default;
  const jsPDF = (await import("jspdf")).default;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const boxW = pageWidth - 2 * marginMm;
  const boxH = pageHeight - 2 * marginMm;

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) pdf.addPage();
    const el = elements[i]!;
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      onclone,
    });

    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error("PDF için geçerli görüntü oluşmadı");
    }

    const imgAspect = canvas.width / canvas.height;
    const boxAspect = boxW / boxH;
    let drawW: number;
    let drawH: number;
    if (imgAspect > boxAspect) {
      drawW = boxW;
      drawH = boxW / imgAspect;
    } else {
      drawH = boxH;
      drawW = boxH * imgAspect;
    }

    const x = marginMm;
    const y = marginMm;
    const imgData = canvas.toDataURL("image/jpeg", imageQuality);
    pdf.addImage(imgData, "JPEG", x, y, drawW, drawH);
  }

  pdf.save(fileName);
}
