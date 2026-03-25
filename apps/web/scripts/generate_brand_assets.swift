import AppKit
import Foundation

struct AssetSpec {
    let path: String
    let width: Int
    let height: Int
    let kind: Kind

    enum Kind {
        case appIcon
        case adaptiveForeground
        case splash
    }
}

let fileManager = FileManager.default
let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let root: URL = {
    if fileManager.fileExists(atPath: currentDirectory.appendingPathComponent("ios").path),
       fileManager.fileExists(atPath: currentDirectory.appendingPathComponent("android").path) {
        return currentDirectory
    }

    let workspaceRoot = currentDirectory.appendingPathComponent("apps/web")
    if fileManager.fileExists(atPath: workspaceRoot.appendingPathComponent("ios").path),
       fileManager.fileExists(atPath: workspaceRoot.appendingPathComponent("android").path) {
        return workspaceRoot
    }

    fputs("Could not locate the apps/web workspace from \(currentDirectory.path)\n", stderr)
    exit(1)
}()

let specs: [AssetSpec] = [
    .init(path: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", width: 1024, height: 1024, kind: .appIcon),
    .init(path: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", width: 2732, height: 2732, kind: .splash),
    .init(path: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", width: 2732, height: 2732, kind: .splash),
    .init(path: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", width: 2732, height: 2732, kind: .splash),
    .init(path: "android/app/src/main/res/mipmap-mdpi/ic_launcher.png", width: 48, height: 48, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-hdpi/ic_launcher.png", width: 72, height: 72, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", width: 96, height: 96, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", width: 144, height: 144, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", width: 192, height: 192, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", width: 48, height: 48, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", width: 72, height: 72, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", width: 96, height: 96, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", width: 144, height: 144, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", width: 192, height: 192, kind: .appIcon),
    .init(path: "android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png", width: 108, height: 108, kind: .adaptiveForeground),
    .init(path: "android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png", width: 162, height: 162, kind: .adaptiveForeground),
    .init(path: "android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png", width: 216, height: 216, kind: .adaptiveForeground),
    .init(path: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", width: 324, height: 324, kind: .adaptiveForeground),
    .init(path: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", width: 432, height: 432, kind: .adaptiveForeground),
    .init(path: "android/app/src/main/res/drawable/splash.png", width: 480, height: 320, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-port-mdpi/splash.png", width: 320, height: 480, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-port-hdpi/splash.png", width: 480, height: 800, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-port-xhdpi/splash.png", width: 720, height: 1280, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-port-xxhdpi/splash.png", width: 960, height: 1600, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-port-xxxhdpi/splash.png", width: 1280, height: 1920, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-land-mdpi/splash.png", width: 480, height: 320, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-land-hdpi/splash.png", width: 800, height: 480, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-land-xhdpi/splash.png", width: 1280, height: 720, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-land-xxhdpi/splash.png", width: 1600, height: 960, kind: .splash),
    .init(path: "android/app/src/main/res/drawable-land-xxxhdpi/splash.png", width: 1920, height: 1280, kind: .splash)
]

let bg = NSColor(calibratedRed: 244 / 255, green: 239 / 255, blue: 231 / 255, alpha: 1)
let bgAlt = NSColor(calibratedRed: 250 / 255, green: 246 / 255, blue: 239 / 255, alpha: 1)
let deep = NSColor(calibratedRed: 16 / 255, green: 32 / 255, blue: 25 / 255, alpha: 1)
let accent = NSColor(calibratedRed: 164 / 255, green: 81 / 255, blue: 42 / 255, alpha: 1)
let accentSoft = NSColor(calibratedRed: 241 / 255, green: 200 / 255, blue: 159 / 255, alpha: 1)
let cream = NSColor(calibratedRed: 255 / 255, green: 248 / 255, blue: 242 / 255, alpha: 1)

for spec in specs {
    let image = NSImage(size: NSSize(width: spec.width, height: spec.height))
    image.lockFocus()

    let rect = NSRect(x: 0, y: 0, width: spec.width, height: spec.height)
    switch spec.kind {
    case .appIcon:
        drawIcon(in: rect, transparent: false)
    case .adaptiveForeground:
        drawIcon(in: rect, transparent: true)
    case .splash:
        drawSplash(in: rect)
    }

    image.unlockFocus()

    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .png, properties: [:])
    else {
        fputs("Could not render \(spec.path)\n", stderr)
        exit(1)
    }

    let absolutePath = root.appendingPathComponent(spec.path)
    try fileManager.createDirectory(at: absolutePath.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: absolutePath)
    print("Wrote \(spec.path)")
}

func drawIcon(in rect: NSRect, transparent: Bool) {
    if !transparent {
        let background = NSBezierPath(roundedRect: rect, xRadius: rect.width * 0.22, yRadius: rect.height * 0.22)
        background.addClip()
        let gradient = NSGradient(colors: [deep, accent])!
        gradient.draw(in: rect, angle: -45)
        drawSoftGlow(in: rect)
        drawFrameMark(in: rect, padded: false)
        return
    }

    NSColor.clear.setFill()
    rect.fill()

    let tileSize = min(rect.width, rect.height) * 0.72
    let tileRect = NSRect(
        x: rect.midX - tileSize / 2,
        y: rect.midY - tileSize / 2,
        width: tileSize,
        height: tileSize
    )

    let tile = NSBezierPath(roundedRect: tileRect, xRadius: tileRect.width * 0.24, yRadius: tileRect.height * 0.24)
    tile.addClip()
    let gradient = NSGradient(colors: [deep, accent])!
    gradient.draw(in: tileRect, angle: -45)
    drawFrameMark(in: tileRect, padded: true)
}

func drawSplash(in rect: NSRect) {
    bg.setFill()
    rect.fill()

    let topOrbRect = NSRect(
        x: rect.width * 0.58,
        y: rect.height * 0.62,
        width: rect.width * 0.54,
        height: rect.width * 0.54
    )
    let lowerOrbRect = NSRect(
        x: rect.width * 0.02,
        y: rect.height * 0.03,
        width: rect.width * 0.46,
        height: rect.width * 0.46
    )

    let topOrb = NSBezierPath(ovalIn: topOrbRect)
    NSGraphicsContext.saveGraphicsState()
    topOrb.addClip()
    NSGradient(colors: [accent.withAlphaComponent(0.18), accentSoft.withAlphaComponent(0.02)])?.draw(in: topOrbRect, relativeCenterPosition: .zero)
    NSGraphicsContext.restoreGraphicsState()

    let lowerOrb = NSBezierPath(ovalIn: lowerOrbRect)
    NSGraphicsContext.saveGraphicsState()
    lowerOrb.addClip()
    NSGradient(colors: [accentSoft.withAlphaComponent(0.22), bgAlt.withAlphaComponent(0.02)])?.draw(in: lowerOrbRect, relativeCenterPosition: .zero)
    NSGraphicsContext.restoreGraphicsState()

    let badgeSize = min(rect.width, rect.height) * 0.23
    let badgeRect = NSRect(
        x: rect.midX - badgeSize / 2,
        y: rect.midY - badgeSize * 0.18,
        width: badgeSize,
        height: badgeSize
    )

    let badge = NSBezierPath(roundedRect: badgeRect, xRadius: badgeRect.width * 0.23, yRadius: badgeRect.height * 0.23)
    badge.addClip()
    let gradient = NSGradient(colors: [deep, accent])!
    gradient.draw(in: badgeRect, angle: -45)
    drawFrameMark(in: badgeRect, padded: false)

    let titleStyle = NSMutableParagraphStyle()
    titleStyle.alignment = .center
    let titleAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: badgeSize * 0.2, weight: .bold),
        .foregroundColor: deep,
        .paragraphStyle: titleStyle
    ]
    let subtitleAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: badgeSize * 0.07, weight: .medium),
        .foregroundColor: deep.withAlphaComponent(0.65),
        .paragraphStyle: titleStyle
    ]

    let title = NSString(string: "EventFrame")
    let subtitle = NSString(string: "Private event albums")
    let titleRect = NSRect(
        x: rect.width * 0.18,
        y: badgeRect.minY - badgeSize * 0.34,
        width: rect.width * 0.64,
        height: badgeSize * 0.22
    )
    let subtitleRect = NSRect(
        x: rect.width * 0.22,
        y: titleRect.minY - badgeSize * 0.12,
        width: rect.width * 0.56,
        height: badgeSize * 0.1
    )

    title.draw(in: titleRect, withAttributes: titleAttributes)
    subtitle.draw(in: subtitleRect, withAttributes: subtitleAttributes)
}

func drawFrameMark(in rect: NSRect, padded: Bool) {
    let workingRect = padded ? rect.insetBy(dx: rect.width * 0.11, dy: rect.height * 0.11) : rect
    let outerLineWidth = workingRect.width * 0.036
    let innerLineWidth = workingRect.width * 0.018

    let outerRect = workingRect.insetBy(dx: workingRect.width * 0.17, dy: workingRect.height * 0.17)
    let outer = NSBezierPath(roundedRect: outerRect, xRadius: outerRect.width * 0.14, yRadius: outerRect.height * 0.14)
    cream.withAlphaComponent(0.95).setStroke()
    outer.lineWidth = outerLineWidth
    outer.stroke()

    let innerRect = outerRect.insetBy(dx: outerRect.width * 0.14, dy: outerRect.height * 0.14)
    let inner = NSBezierPath(roundedRect: innerRect, xRadius: innerRect.width * 0.1, yRadius: innerRect.height * 0.1)
    accentSoft.withAlphaComponent(0.95).setStroke()
    inner.lineWidth = innerLineWidth
    inner.stroke()

    let titleStyle = NSMutableParagraphStyle()
    titleStyle.alignment = .center
    let markAttributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: innerRect.height * 0.4, weight: .black),
        .foregroundColor: cream,
        .paragraphStyle: titleStyle
    ]

    let mark = NSString(string: "EF")
    let markRect = NSRect(
        x: innerRect.minX,
        y: innerRect.midY - innerRect.height * 0.18,
        width: innerRect.width,
        height: innerRect.height * 0.42
    )
    mark.draw(in: markRect, withAttributes: markAttributes)
}

func drawSoftGlow(in rect: NSRect) {
    let glowRect = NSRect(
        x: rect.width * 0.45,
        y: rect.height * 0.52,
        width: rect.width * 0.7,
        height: rect.width * 0.7
    )
    let glow = NSBezierPath(ovalIn: glowRect)
    NSGraphicsContext.saveGraphicsState()
    glow.addClip()
    NSGradient(colors: [accentSoft.withAlphaComponent(0.28), NSColor.clear])?.draw(in: glowRect, relativeCenterPosition: .zero)
    NSGraphicsContext.restoreGraphicsState()
}
