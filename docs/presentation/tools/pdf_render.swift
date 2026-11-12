// Рисует каждую страницу PDF в PNG средствами PDFKit (как её покажет просмотрщик), печатает размеры страниц и ссылки.
// swift tools/pdf_render.swift presentation.pdf <папка> [ширина_px=1920]
import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: a[1])) else { print("PDF не открылся"); exit(1) }
let dir = a[2], W = Double(a.count > 3 ? a[3] : "1920")!
try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
print("страниц:", doc.pageCount, " заголовок:", (doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String) ?? "—")
for i in 0..<doc.pageCount {
  let p = doc.page(at: i)!
  let box = p.bounds(for: .mediaBox), s = W / box.width
  let w = Int((box.width * s).rounded()), h = Int((box.height * s).rounded())
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(red: 1, green: 0, blue: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h)) // пурпур — видно дыры
  ctx.scaleBy(x: s, y: s)
  p.draw(with: .mediaBox, to: ctx)
  let url = URL(fileURLWithPath: String(format: "%@/slide-%02d.png", dir, i + 1))
  let dst = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, ctx.makeImage()!, nil); CGImageDestinationFinalize(dst)
  let links = p.annotations.compactMap { an -> String? in
    guard let u = an.url else { return nil }
    return "\(u.absoluteString) [\(Int(an.bounds.minX * s)),\(Int((box.height - an.bounds.maxY) * s)) \(Int(an.bounds.width * s))×\(Int(an.bounds.height * s))]"
  }
  print(String(format: "стр. %d: %.2f × %.2f pt", i + 1, box.width, box.height), links.isEmpty ? "" : "ссылки: " + links.joined(separator: " | "))
}
