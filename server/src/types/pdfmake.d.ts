declare module "pdfmake/js/Printer.js" {
  import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces.js";

  interface PDFDocument extends NodeJS.ReadWriteStream {
    end(): void;
  }

  class PdfPrinter {
    constructor(fonts: TFontDictionary);
    createPdfKitDocument(docDefinition: TDocumentDefinitions): PDFDocument;
  }

  export default PdfPrinter;
}
