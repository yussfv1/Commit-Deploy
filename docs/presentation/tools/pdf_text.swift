// Текстовый слой каждой страницы PDF (то, что найдёт поиск и скопирует жюри): swift tools/pdf_text.swift presentation.pdf
import Foundation
import PDFKit
let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
for i in 0..<doc.pageCount {
  let s = (doc.page(at: i)!.string ?? "").replacingOccurrences(of: "\u{00A0}", with: "⍽")
  print("── \(i + 1) ──\n" + s.split(separator: "\n").map { String($0) }.joined(separator: " ¦ "))
}
