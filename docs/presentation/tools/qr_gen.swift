// QR-матрица библиотекой Core Image (CIQRCodeGenerator): swift qr_gen.swift <текст> [L|M|Q|H]
// Печатает строки из 0/1 без белой рамки — тихую зону 4 модуля добавляет вёрстка.
import Foundation
import CoreImage
let a = CommandLine.arguments
let f = CIFilter(name: "CIQRCodeGenerator")!
f.setValue(a[1].data(using: .utf8), forKey: "inputMessage")
f.setValue(a.count > 2 ? a[2] : "M", forKey: "inputCorrectionLevel")
let img = f.outputImage!
let cg = CIContext().createCGImage(img, from: img.extent)!
let w = cg.width, h = cg.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
var rows: [String] = []
for y in 0..<h { var r = ""; for x in 0..<w { r += px[(y * w + x) * 4] < 128 ? "1" : "0" }; rows.append(r) }
// убрать белую рамку генератора
while let r = rows.first, !r.contains("1") { rows.removeFirst() }
while let r = rows.last, !r.contains("1") { rows.removeLast() }
var l = 0; while rows.allSatisfy({ Array($0)[l] == "0" }) { l += 1 }
var rr = rows[0].count; while rows.allSatisfy({ Array($0)[rr - 1] == "0" }) { rr -= 1 }
for r in rows { print(String(Array(r)[l..<rr])) }
