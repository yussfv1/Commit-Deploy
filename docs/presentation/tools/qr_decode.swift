// Распознаёт QR на картинках детектором Core Image (независимо от генератора): swift tools/qr_decode.swift a.png b.png …
import Foundation
import CoreImage
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for path in CommandLine.arguments.dropFirst() {
  guard let img = CIImage(contentsOf: URL(fileURLWithPath: path)) else { print(path, "— не открылся"); continue }
  let found = det.features(in: img).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
  print((path as NSString).lastPathComponent + ":", found.isEmpty ? "QR не найден" : found.joined(separator: " | "))
}
