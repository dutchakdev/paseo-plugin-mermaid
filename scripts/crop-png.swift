// Crops the top-left width x height pixels of a PNG, keeping alpha.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
guard a.count == 5, let w = Int(a[3]), let h = Int(a[4]),
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(src, 0, nil),
      let cropped = image.cropping(to: CGRect(x: 0, y: 0, width: w, height: h)),
      let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { FileHandle.standardError.write("usage: crop in.png out.png width height\n".data(using: .utf8)!); exit(2) }
CGImageDestinationAddImage(dst, cropped, nil)
exit(CGImageDestinationFinalize(dst) ? 0 : 1)
