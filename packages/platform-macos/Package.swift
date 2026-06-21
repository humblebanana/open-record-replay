// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "ORRPlatformMacOS",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "orr-platform-macos", targets: ["ORRPlatformMacOS"])
    ],
    targets: [
        .executableTarget(name: "ORRPlatformMacOS")
    ]
)
