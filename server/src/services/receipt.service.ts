import PDFDocument from "pdfkit";
import { getDB } from "../database.js";

export interface ReceiptData {
  transactionId: number;
  amount: number;
  currency: string;
  useCase: string;
  nickname?: string;
  date: string;
  description: string;
}

function getClubName(): string {
  try {
    const db = getDB();
    const result = db.exec("SELECT value FROM settings WHERE key = 'club_name'");
    return (result[0]?.values[0]?.[0] as string) || "OpenKick";
  } catch {
    return "OpenKick";
  }
}

function formatAmount(centimes: number, currency: string): string {
  const major = (centimes / 100).toFixed(2);
  return `${currency} ${major}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const useCaseLabels: Record<string, string> = {
  tournament_fee: "Tournament participation fee",
  survey_order: "Merchandise order",
  donation: "Donation",
};

export function generateReceipt(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const clubName = getClubName();

    // Header
    doc.fontSize(20).text(clubName, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).text("Payment Receipt", { align: "center" });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Details
    doc.fontSize(11);

    const details: [string, string][] = [
      ["Receipt No.", `#${data.transactionId}`],
      ["Date", formatDate(data.date)],
      ["Purpose", useCaseLabels[data.useCase] || data.useCase],
      ["Description", data.description],
      ["Amount", formatAmount(data.amount, data.currency)],
    ];

    if (data.nickname) {
      details.push(["Player", data.nickname]);
    }

    for (const [label, value] of details) {
      doc.font("Helvetica-Bold").text(`${label}:`, { continued: true });
      doc.font("Helvetica").text(`  ${value}`);
      doc.moveDown(0.3);
    }

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(9).fillColor("#666666");
    doc.text(
      "This is an automatically generated receipt. No signature required.",
      { align: "center" }
    );

    doc.end();
  });
}
